import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
	computeNextRun,
	describeOneTime,
	describeRecurrence,
} from "../src/recurrence/engine";
import type {
	RecurrenceMonthlyLast,
	RecurrenceMonthlyLastDays,
	RecurrenceMonthlyNth,
	RecurrenceWeekly,
} from "../src/types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function utc(iso: string): DateTime {
	return DateTime.fromISO(iso, { zone: "utc" });
}

// ── computeNextRun — weekly ─────────────────────────────────────────────────

describe("computeNextRun — weekly", () => {
	const rec: RecurrenceWeekly = {
		type: "weekly",
		interval_weeks: 1,
		weekdays: ["Mon", "Wed", "Fri"],
		time_local: "09:00",
	};

	it("finds the same day when a later slot exists today", () => {
		// Wed Mar 4 08:30 UTC — Wed 09:00 slot is still ahead
		const result = computeNextRun(utc("2026-03-04T08:30:00.000Z"), rec, "UTC");
		expect(result.toISO()).toBe("2026-03-04T09:00:00.000Z");
	});

	it("skips the current slot when afterUtc equals fire time exactly", () => {
		// Wed Mar 4 09:00 UTC — exact boundary, not strictly after → next Fri
		const result = computeNextRun(utc("2026-03-04T09:00:00.000Z"), rec, "UTC");
		expect(result.toISO()).toBe("2026-03-06T09:00:00.000Z");
	});

	it("rolls over to next week when no slots remain this week", () => {
		// Fri Mar 6 10:00 UTC — all three slots exhausted → next Mon
		const result = computeNextRun(utc("2026-03-06T10:00:00.000Z"), rec, "UTC");
		expect(result.toISO()).toBe("2026-03-09T09:00:00.000Z");
	});

	it("respects interval_weeks: 2 by jumping two weeks ahead", () => {
		// Sun Mar 8 10:00 UTC, single weekday Mon, every 2 weeks
		// weekStart = Mon Mar 2; no Mon slot after Mar 8 → jump 2 weeks to Mar 16
		const biWeekly: RecurrenceWeekly = {
			type: "weekly",
			interval_weeks: 2,
			weekdays: ["Mon"],
			time_local: "09:00",
		};
		const result = computeNextRun(
			utc("2026-03-08T10:00:00.000Z"),
			biWeekly,
			"UTC",
		);
		expect(result.toISO()).toBe("2026-03-16T09:00:00.000Z");
	});

	it("handles a single-weekday schedule rolling to the following week", () => {
		// Mon Mar 9 09:30 UTC — only weekday is Mon; 09:00 already passed → next Mon Mar 16
		const monOnly: RecurrenceWeekly = {
			type: "weekly",
			interval_weeks: 1,
			weekdays: ["Mon"],
			time_local: "09:00",
		};
		const result = computeNextRun(
			utc("2026-03-09T09:30:00.000Z"),
			monOnly,
			"UTC",
		);
		expect(result.toISO()).toBe("2026-03-16T09:00:00.000Z");
	});
});

// ── computeNextRun — monthly_nth ────────────────────────────────────────────

describe("computeNextRun — monthly_nth", () => {
	const firstMon: RecurrenceMonthlyNth = {
		type: "monthly",
		mode: "nth_weekday",
		interval_months: 1,
		ordinal: 1,
		weekday: "Mon",
		time_local: "09:00",
	};

	it("returns the 1st Monday of the current month when it is still ahead", () => {
		// Mar 1 2026 is Sun; 1st Mon = Mar 2; after Mar 1 08:00 → Mar 2 09:00
		const result = computeNextRun(
			utc("2026-03-01T08:00:00.000Z"),
			firstMon,
			"UTC",
		);
		expect(result.toISO()).toBe("2026-03-02T09:00:00.000Z");
	});

	it("advances to the next month when the current-month occurrence is past", () => {
		// After Mar 2 10:01 → next 1st Mon = Apr 6 (Apr 1 is Wed → Apr 6 is Mon)
		const result = computeNextRun(
			utc("2026-03-02T10:01:00.000Z"),
			firstMon,
			"UTC",
		);
		expect(result.toISO()).toBe("2026-04-06T09:00:00.000Z");
	});

	it("finds the 4th Thursday in a normal month", () => {
		// Mar 2026: 1st Thu = Mar 5 → 4th Thu = Mar 26
		const fourthThu: RecurrenceMonthlyNth = {
			type: "monthly",
			mode: "nth_weekday",
			interval_months: 1,
			ordinal: 4,
			weekday: "Thu",
			time_local: "09:00",
		};
		const result = computeNextRun(
			utc("2026-03-01T08:00:00.000Z"),
			fourthThu,
			"UTC",
		);
		expect(result.toISO()).toBe("2026-03-26T09:00:00.000Z");
	});

	it("skips months where the ordinal does not exist (5th Mon in Feb)", () => {
		// Feb 2026 has no 5th Monday (Feb 2 + 4 weeks = Mar 2, wrong month) → skip to Mar
		// Mar 2026: 1st Mon = Mar 2 → 5th Mon = Mar 30
		const fifthMon: RecurrenceMonthlyNth = {
			type: "monthly",
			mode: "nth_weekday",
			interval_months: 1,
			ordinal: 5,
			weekday: "Mon",
			time_local: "09:00",
		};
		const result = computeNextRun(
			utc("2026-02-01T08:00:00.000Z"),
			fifthMon,
			"UTC",
		);
		expect(result.toISO()).toBe("2026-03-30T09:00:00.000Z");
	});

	it("interval_months field does not affect computeNextRun (engine finds next valid month)", () => {
		// interval_months: 2 is recorded but computeNextRun still returns the nearest qualifying date
		const biMonthly: RecurrenceMonthlyNth = {
			type: "monthly",
			mode: "nth_weekday",
			interval_months: 2,
			ordinal: 1,
			weekday: "Mon",
			time_local: "09:00",
		};
		// After Mar 2 10:01, next 1st Mon = Apr 6 regardless of interval_months
		const result = computeNextRun(
			utc("2026-03-02T10:01:00.000Z"),
			biMonthly,
			"UTC",
		);
		expect(result.toISO()).toBe("2026-04-06T09:00:00.000Z");
	});
});

// ── computeNextRun — monthly_last ───────────────────────────────────────────

describe("computeNextRun — monthly_last", () => {
	const lastFri: RecurrenceMonthlyLast = {
		type: "monthly",
		mode: "last_week",
		interval_months: 1,
		weekday: "Fri",
		time_local: "09:00",
	};

	it("finds the last Friday of February 2026 (Feb 27)", () => {
		// Feb 2026: 28 days, last day = Feb 28 (Sat) → walk back to Feb 27 (Fri)
		const result = computeNextRun(
			utc("2026-02-01T08:00:00.000Z"),
			lastFri,
			"UTC",
		);
		expect(result.toISO()).toBe("2026-02-27T09:00:00.000Z");
	});

	it("advances to March when afterUtc equals the February fire time exactly", () => {
		// Feb 27 09:00 is not strictly after → advance to Mar's last Fri = Mar 27
		const result = computeNextRun(
			utc("2026-02-27T09:00:00.000Z"),
			lastFri,
			"UTC",
		);
		expect(result.toISO()).toBe("2026-03-27T09:00:00.000Z");
	});
});

// ── computeNextRun — monthly_last_days ──────────────────────────────────────

describe("computeNextRun — monthly_last_days", () => {
	const rec: RecurrenceMonthlyLastDays = {
		type: "monthly",
		mode: "last_days",
		interval_months: 1,
		time_local: "09:00",
	};

	it("finds the 3rd-to-last day of January (Jan 29)", () => {
		const result = computeNextRun(
			utc("2026-01-15T08:00:00.000Z"),
			rec,
			"UTC",
		);
		expect(result.toISO()).toBe("2026-01-29T09:00:00.000Z");
	});

	it("advances to 2nd-to-last when afterUtc equals the 3rd-to-last fire time", () => {
		// Jan 29 09:00 is exact boundary → next slot is Jan 30
		const result = computeNextRun(
			utc("2026-01-29T09:00:00.000Z"),
			rec,
			"UTC",
		);
		expect(result.toISO()).toBe("2026-01-30T09:00:00.000Z");
	});

	it("advances to last day of January when afterUtc is 2nd-to-last fire time", () => {
		const result = computeNextRun(
			utc("2026-01-30T09:00:00.000Z"),
			rec,
			"UTC",
		);
		expect(result.toISO()).toBe("2026-01-31T09:00:00.000Z");
	});

	it("rolls over to February after all January slots pass", () => {
		// Jan 31 09:00 used → Feb 2026 (28 days): last 3 = Feb 26, 27, 28
		const result = computeNextRun(
			utc("2026-01-31T09:00:00.000Z"),
			rec,
			"UTC",
		);
		expect(result.toISO()).toBe("2026-02-26T09:00:00.000Z");
	});

	it("uses Feb 27/28/29 as last 3 days in a leap year (2028)", () => {
		// Feb 2028 has 29 days; last 3 = Feb 27, 28, 29
		const result = computeNextRun(
			utc("2028-01-31T09:00:00.000Z"),
			rec,
			"UTC",
		);
		expect(result.toISO()).toBe("2028-02-27T09:00:00.000Z");
	});
});

// ── describeRecurrence ──────────────────────────────────────────────────────

describe("describeRecurrence", () => {
	it("formats weekly interval_weeks=1 with multiple days", () => {
		const rec: RecurrenceWeekly = {
			type: "weekly",
			interval_weeks: 1,
			weekdays: ["Mon", "Wed"],
			time_local: "09:00",
		};
		expect(describeRecurrence(rec)).toBe("Every week on Mon, Wed at 09:00");
	});

	it("formats weekly interval_weeks=2", () => {
		const rec: RecurrenceWeekly = {
			type: "weekly",
			interval_weeks: 2,
			weekdays: ["Tue"],
			time_local: "08:30",
		};
		expect(describeRecurrence(rec)).toBe("Every 2 weeks on Tue at 08:30");
	});

	it("formats monthly nth_weekday ordinals 1-4", () => {
		const cases: [number, string][] = [
			[1, "Every month on the 1st Mon at 09:00"],
			[2, "Every month on the 2nd Mon at 09:00"],
			[3, "Every month on the 3rd Mon at 09:00"],
			[4, "Every month on the 4th Mon at 09:00"],
		];
		for (const [ordinal, expected] of cases) {
			const rec: RecurrenceMonthlyNth = {
				type: "monthly",
				mode: "nth_weekday",
				interval_months: 1,
				ordinal,
				weekday: "Mon",
				time_local: "09:00",
			};
			expect(describeRecurrence(rec)).toBe(expected);
		}
	});

	it("formats monthly last_week", () => {
		const rec: RecurrenceMonthlyLast = {
			type: "monthly",
			mode: "last_week",
			interval_months: 1,
			weekday: "Fri",
			time_local: "09:00",
		};
		expect(describeRecurrence(rec)).toBe(
			"Every month on the last Fri at 09:00",
		);
	});

	it("formats monthly last_days", () => {
		const rec: RecurrenceMonthlyLastDays = {
			type: "monthly",
			mode: "last_days",
			interval_months: 1,
			time_local: "09:00",
		};
		expect(describeRecurrence(rec)).toBe(
			"Every month on the last 3 days at 09:00",
		);
	});
});

// ── describeOneTime ─────────────────────────────────────────────────────────

describe("describeOneTime", () => {
	it("formats a UTC timestamp correctly", () => {
		// March 15 2026 is a Sunday
		expect(describeOneTime("2026-03-15T14:30:00.000Z", "UTC")).toBe(
			"Sunday, March 15 2026, 14:30 (UTC)",
		);
	});

	it("converts UTC timestamp to America/New_York (EST = UTC-5)", () => {
		// March 1 2026 is a Sunday; 15:00 UTC → 10:00 EST (before DST on Mar 8)
		expect(
			describeOneTime("2026-03-01T15:00:00.000Z", "America/New_York"),
		).toBe("Sunday, March 1 2026, 10:00 (EST)");
	});
});
