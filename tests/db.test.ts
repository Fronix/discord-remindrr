import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above imports by Vitest's transformer, so config.ts is
// stubbed before database.ts / reminders.ts first require it.
vi.mock("../src/config", () => ({
	config: {
		DISCORD_TOKEN: "fake-token",
		SQLITE_PATH: ":memory:",
		DEFAULT_TIMEZONE: "UTC",
		WORKER_INTERVAL_SECONDS: 30,
		ALLOW_EVERYONE_MENTIONS: false,
		HEALTH_PORT: 3000,
	},
}));

import { closeDb } from "../src/db/database";
import {
	advanceRecurring,
	cancel,
	createOneTimeReminder,
	createRecurringReminder,
	getById,
	getDueOneTime,
	getDueRecurring,
	markFailed,
	markSent,
	setConfirmationMessageId,
} from "../src/db/reminders";
import type { RecurrenceWeekly } from "../src/types";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BASE = {
	guild_id: "g1",
	channel_id: "c1",
	creator_user_id: "u1",
	message_text: "Test",
	timezone: "UTC",
};

const FUTURE = "2030-01-01T10:00:00.000Z";
const PAST = "2020-01-01T10:00:00.000Z";
const NEXT_FUTURE = "2030-06-01T10:00:00.000Z";

const WEEKLY_REC: RecurrenceWeekly = {
	type: "weekly",
	interval_weeks: 1,
	weekdays: ["Mon"],
	time_local: "09:00",
};

// Re-create a fresh :memory: DB for each test by closing the singleton.
afterEach(() => {
	closeDb();
});

// ── createOneTimeReminder ─────────────────────────────────────────────────────

describe("createOneTimeReminder", () => {
	it("returns a reminder with expected defaults", () => {
		const r = createOneTimeReminder({ ...BASE, scheduled_at_utc: FUTURE });
		expect(r.status).toBe("scheduled");
		expect(r.is_repeating).toBe(false);
		expect(r.run_count).toBe(0);
		expect(r.scheduled_at_utc).toBe(FUTURE);
		expect(r.recurrence).toBeNull();
		expect(r.next_run_at_utc).toBeNull();
	});

	it("assigns distinct auto-increment IDs to two inserts", () => {
		const a = createOneTimeReminder({ ...BASE, scheduled_at_utc: FUTURE });
		const b = createOneTimeReminder({ ...BASE, scheduled_at_utc: FUTURE });
		expect(a.id).not.toBe(b.id);
	});
});

// ── createRecurringReminder ───────────────────────────────────────────────────

describe("createRecurringReminder", () => {
	it("returns a reminder flagged as repeating", () => {
		const r = createRecurringReminder({
			...BASE,
			recurrence: WEEKLY_REC,
			next_run_at_utc: FUTURE,
		});
		expect(r.is_repeating).toBe(true);
		expect(r.status).toBe("scheduled");
		expect(r.scheduled_at_utc).toBeNull();
	});

	it("round-trips the recurrence JSON correctly", () => {
		const r = createRecurringReminder({
			...BASE,
			recurrence: WEEKLY_REC,
			next_run_at_utc: FUTURE,
		});
		expect(r.recurrence).toEqual(WEEKLY_REC);
	});
});

// ── getById ───────────────────────────────────────────────────────────────────

describe("getById", () => {
	it("returns null for a non-existent ID", () => {
		expect(getById(9999)).toBeNull();
	});

	it("returns the correct reminder for a valid ID", () => {
		const created = createOneTimeReminder({ ...BASE, scheduled_at_utc: FUTURE });
		const fetched = getById(created.id);
		expect(fetched).not.toBeNull();
		expect(fetched?.id).toBe(created.id);
		expect(fetched?.message_text).toBe("Test");
	});
});

// ── getDueOneTime ─────────────────────────────────────────────────────────────

describe("getDueOneTime", () => {
	it("returns empty array when table is empty", () => {
		expect(getDueOneTime(0)).toEqual([]);
	});

	it("returns a past-scheduled reminder", () => {
		createOneTimeReminder({ ...BASE, scheduled_at_utc: PAST });
		expect(getDueOneTime(0)).toHaveLength(1);
	});

	it("does not return a future-scheduled reminder", () => {
		createOneTimeReminder({ ...BASE, scheduled_at_utc: FUTURE });
		expect(getDueOneTime(0)).toHaveLength(0);
	});

	it("does not return reminders with status 'sent'", () => {
		const r = createOneTimeReminder({ ...BASE, scheduled_at_utc: PAST });
		markSent(r.id);
		expect(getDueOneTime(0)).toHaveLength(0);
	});

	it("returns multiple due reminders ordered by scheduled_at_utc ASC", () => {
		createOneTimeReminder({ ...BASE, scheduled_at_utc: "2020-06-01T10:00:00.000Z" });
		createOneTimeReminder({ ...BASE, scheduled_at_utc: "2019-01-01T10:00:00.000Z" });
		const due = getDueOneTime(0);
		expect(due).toHaveLength(2);
		expect(due[0].scheduled_at_utc! < due[1].scheduled_at_utc!).toBe(true);
	});
});

// ── getDueRecurring ───────────────────────────────────────────────────────────

describe("getDueRecurring", () => {
	it("returns a past-scheduled recurring reminder", () => {
		createRecurringReminder({ ...BASE, recurrence: WEEKLY_REC, next_run_at_utc: PAST });
		expect(getDueRecurring(0)).toHaveLength(1);
	});

	it("does not return a future-scheduled recurring reminder", () => {
		createRecurringReminder({ ...BASE, recurrence: WEEKLY_REC, next_run_at_utc: FUTURE });
		expect(getDueRecurring(0)).toHaveLength(0);
	});

	it("does not return one-time reminders", () => {
		createOneTimeReminder({ ...BASE, scheduled_at_utc: PAST });
		expect(getDueRecurring(0)).toHaveLength(0);
	});
});

// ── markSent ──────────────────────────────────────────────────────────────────

describe("markSent", () => {
	it("first call returns true and updates status, run_count, last_run_at_utc", () => {
		const r = createOneTimeReminder({ ...BASE, scheduled_at_utc: PAST });
		expect(markSent(r.id)).toBe(true);
		const updated = getById(r.id)!;
		expect(updated.status).toBe("sent");
		expect(updated.run_count).toBe(1);
		expect(updated.last_run_at_utc).not.toBeNull();
	});

	it("second call returns false (idempotent guard — status no longer 'scheduled')", () => {
		const r = createOneTimeReminder({ ...BASE, scheduled_at_utc: PAST });
		markSent(r.id);
		expect(markSent(r.id)).toBe(false);
		expect(getById(r.id)?.run_count).toBe(1);
	});

	it("reminder is absent from getDueOneTime after markSent", () => {
		const r = createOneTimeReminder({ ...BASE, scheduled_at_utc: PAST });
		markSent(r.id);
		expect(getDueOneTime(0)).toHaveLength(0);
	});
});

// ── advanceRecurring ──────────────────────────────────────────────────────────

describe("advanceRecurring", () => {
	it("first call returns true and advances next_run_at_utc", () => {
		const r = createRecurringReminder({ ...BASE, recurrence: WEEKLY_REC, next_run_at_utc: PAST });
		expect(advanceRecurring(r.id, FUTURE)).toBe(true);
		const updated = getById(r.id)!;
		expect(updated.next_run_at_utc).toBe(FUTURE);
		expect(updated.run_count).toBe(1);
	});

	it("second call with a new timestamp also returns true (status stays 'scheduled')", () => {
		const r = createRecurringReminder({ ...BASE, recurrence: WEEKLY_REC, next_run_at_utc: PAST });
		advanceRecurring(r.id, FUTURE);
		expect(advanceRecurring(r.id, NEXT_FUTURE)).toBe(true);
		expect(getById(r.id)?.run_count).toBe(2);
	});

	it("returns false after cancel (status no longer 'scheduled')", () => {
		const r = createRecurringReminder({ ...BASE, recurrence: WEEKLY_REC, next_run_at_utc: PAST });
		cancel(r.id, BASE.creator_user_id);
		expect(advanceRecurring(r.id, FUTURE)).toBe(false);
	});
});

// ── markFailed ────────────────────────────────────────────────────────────────

describe("markFailed", () => {
	it("sets status to failed", () => {
		const r = createRecurringReminder({ ...BASE, recurrence: WEEKLY_REC, next_run_at_utc: PAST });
		markFailed(r.id);
		expect(getById(r.id)?.status).toBe("failed");
	});

	it("reminder is absent from getDueRecurring after markFailed", () => {
		const r = createRecurringReminder({ ...BASE, recurrence: WEEKLY_REC, next_run_at_utc: PAST });
		markFailed(r.id);
		expect(getDueRecurring(0)).toHaveLength(0);
	});
});

// ── setConfirmationMessageId ──────────────────────────────────────────────────

describe("setConfirmationMessageId", () => {
	it("persists the confirmation_message_id", () => {
		const r = createOneTimeReminder({ ...BASE, scheduled_at_utc: FUTURE });
		setConfirmationMessageId(r.id, "msg-abc");
		expect(getById(r.id)?.confirmation_message_id).toBe("msg-abc");
	});
});

// ── cancel ────────────────────────────────────────────────────────────────────

describe("cancel", () => {
	it("creator can cancel their own scheduled reminder", () => {
		const r = createOneTimeReminder({ ...BASE, scheduled_at_utc: FUTURE });
		expect(cancel(r.id, BASE.creator_user_id)).toBe(true);
		expect(getById(r.id)?.status).toBe("cancelled");
	});

	it("a different user cannot cancel the reminder", () => {
		const r = createOneTimeReminder({ ...BASE, scheduled_at_utc: FUTURE });
		expect(cancel(r.id, "other-user")).toBe(false);
		expect(getById(r.id)?.status).toBe("scheduled");
	});

	it("cancelling an already-cancelled reminder returns false", () => {
		const r = createOneTimeReminder({ ...BASE, scheduled_at_utc: FUTURE });
		cancel(r.id, BASE.creator_user_id);
		expect(cancel(r.id, BASE.creator_user_id)).toBe(false);
	});

	it("cancelling a sent reminder returns false", () => {
		const r = createOneTimeReminder({ ...BASE, scheduled_at_utc: PAST });
		markSent(r.id);
		expect(cancel(r.id, BASE.creator_user_id)).toBe(false);
	});

	it("cancelled reminder is absent from getDueOneTime", () => {
		const r = createOneTimeReminder({ ...BASE, scheduled_at_utc: PAST });
		cancel(r.id, BASE.creator_user_id);
		expect(getDueOneTime(0)).toHaveLength(0);
	});
});

// ── beforeEach guard ──────────────────────────────────────────────────────────

describe("DB isolation between tests", () => {
	beforeEach(() => {
		// Verify each test starts with a clean DB
	});

	it("sees an empty table at the start of a test", () => {
		expect(getDueOneTime(0)).toHaveLength(0);
	});

	it("still sees an empty table in the next test", () => {
		expect(getDueOneTime(0)).toHaveLength(0);
	});
});
