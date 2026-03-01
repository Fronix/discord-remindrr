import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import {
	clearState,
	getState,
	initState,
	patchState,
	purgeExpired,
} from "../src/interactions/state";

const SESSION_ID = "sess0001";
const SESSION_B = "sess0002";
const USER_ID = "user-123";

const BASE_DATA = {
	message: "hello",
	timezone: "UTC",
	date: null,
	interval: null,
	ordinal: null,
};

afterEach(() => {
	clearState(SESSION_ID);
	clearState(SESSION_B);
});

// ── Lifecycle ────────────────────────────────────────────────────────────────

describe("initState / getState", () => {
	it("returns full state with defaults after initState", () => {
		initState(SESSION_ID, USER_ID, BASE_DATA);
		const s = getState(SESSION_ID);
		expect(s).not.toBeNull();
		expect(s?.sessionId).toBe(SESSION_ID);
		expect(s?.userId).toBe(USER_ID);
		expect(s?.message).toBe("hello");
		expect(s?.timezone).toBe("UTC");
		expect(s?.date).toBeNull();
		expect(s?.interval).toBeNull();
		expect(s?.ordinal).toBeNull();
		expect(s?.scheduleType).toBeNull();
		expect(s?.weekdays).toBeNull();
		expect(s?.hour).toBe("12");
		expect(s?.minute).toBe("00");
	});

	it("returns null for an unknown sessionId", () => {
		expect(getState("does-not-exist")).toBeNull();
	});
});

describe("clearState", () => {
	it("makes the session inaccessible after clearing", () => {
		initState(SESSION_ID, USER_ID, BASE_DATA);
		clearState(SESSION_ID);
		expect(getState(SESSION_ID)).toBeNull();
	});

	it("does not throw when clearing a non-existent session", () => {
		expect(() => clearState("never-existed")).not.toThrow();
	});
});

// ── patchState ───────────────────────────────────────────────────────────────

describe("patchState", () => {
	beforeEach(() => {
		initState(SESSION_ID, USER_ID, BASE_DATA);
	});

	it("patches scheduleType individually", () => {
		patchState(SESSION_ID, { scheduleType: "weekly" });
		expect(getState(SESSION_ID)?.scheduleType).toBe("weekly");
	});

	it("patches weekdays individually", () => {
		patchState(SESSION_ID, { weekdays: ["Mon", "Fri"] });
		expect(getState(SESSION_ID)?.weekdays).toEqual(["Mon", "Fri"]);
	});

	it("patches hour individually", () => {
		patchState(SESSION_ID, { hour: "14" });
		expect(getState(SESSION_ID)?.hour).toBe("14");
	});

	it("patches minute individually", () => {
		patchState(SESSION_ID, { minute: "30" });
		expect(getState(SESSION_ID)?.minute).toBe("30");
	});

	it("does not overwrite unpatched fields", () => {
		patchState(SESSION_ID, { hour: "18" });
		const s = getState(SESSION_ID);
		// minute was untouched
		expect(s?.minute).toBe("00");
		expect(s?.message).toBe("hello");
	});

	it("is a no-op for a non-existent session (no error thrown)", () => {
		expect(() =>
			patchState("ghost-session", { scheduleType: "once" }),
		).not.toThrow();
	});

	it("still patches an expired-but-present entry (patchState does not check expiry)", () => {
		vi.useFakeTimers();
		try {
			// initState sets expiresAt = Date.now() + 15min
			initState(SESSION_ID, USER_ID, BASE_DATA);
			// Advance past TTL
			vi.advanceTimersByTime(16 * 60 * 1000);
			// patchState checks only if (!entry) — entry is still in the map
			expect(() =>
				patchState(SESSION_ID, { scheduleType: "weekly" }),
			).not.toThrow();
			// getState however removes and returns null
			expect(getState(SESSION_ID)).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});
});

// ── TTL ──────────────────────────────────────────────────────────────────────

describe("TTL expiry", () => {
	it("getState returns null after 16 minutes (TTL is 15 minutes)", () => {
		vi.useFakeTimers();
		try {
			initState(SESSION_ID, USER_ID, BASE_DATA);
			vi.advanceTimersByTime(16 * 60 * 1000);
			expect(getState(SESSION_ID)).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("getState returns the session when only 14 minutes have passed", () => {
		vi.useFakeTimers();
		try {
			initState(SESSION_ID, USER_ID, BASE_DATA);
			vi.advanceTimersByTime(14 * 60 * 1000);
			expect(getState(SESSION_ID)).not.toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});
});

// ── purgeExpired ─────────────────────────────────────────────────────────────

describe("purgeExpired", () => {
	it("removes only the expired session when two sessions exist", () => {
		vi.useFakeTimers();
		try {
			initState(SESSION_ID, USER_ID, BASE_DATA);
			// Advance 16 min — SESSION_ID is now expired
			vi.advanceTimersByTime(16 * 60 * 1000);
			// Create a fresh session
			initState(SESSION_B, USER_ID, BASE_DATA);

			purgeExpired();

			expect(getState(SESSION_ID)).toBeNull();
			expect(getState(SESSION_B)).not.toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("does not throw on an empty state map", () => {
		expect(() => purgeExpired()).not.toThrow();
	});
});
