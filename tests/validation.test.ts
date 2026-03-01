import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	validateDate,
	validateFuture,
	validateInterval,
	validateOrdinal,
	validateTime,
	validateTimezone,
	validateWeekday,
	validateWeekdays,
} from "../src/interactions/validation";

// ── validateTimezone ─────────────────────────────────────────────────────────

describe("validateTimezone", () => {
	it("accepts 'UTC'", () => {
		expect(validateTimezone("UTC")).toBeNull();
	});

	it("accepts 'America/New_York'", () => {
		expect(validateTimezone("America/New_York")).toBeNull();
	});

	it("rejects an invalid zone string", () => {
		expect(validateTimezone("notazone")).not.toBeNull();
	});

	it("rejects empty string", () => {
		expect(validateTimezone("")).not.toBeNull();
	});

	it("accepts wrong-case zone (Luxon IANAZone.isValidZone is case-insensitive)", () => {
		// Luxon normalises IANA names internally, so "America/New_york" is treated as valid
		expect(validateTimezone("America/New_york")).toBeNull();
	});
});

// ── validateDate ─────────────────────────────────────────────────────────────

describe("validateDate", () => {
	it("accepts a properly formatted date", () => {
		expect(validateDate("2026-03-01")).toBeNull();
	});

	it("rejects compact format (no dashes)", () => {
		expect(validateDate("20260301")).not.toBeNull();
	});

	it("rejects slash-separated format", () => {
		expect(validateDate("2026/03/01")).not.toBeNull();
	});

	it("rejects empty string", () => {
		expect(validateDate("")).not.toBeNull();
	});

	it("accepts out-of-range values (regex only, no calendar check)", () => {
		// validateDate is a pure regex check — '2026-99-99' matches \d{4}-\d{2}-\d{2}
		expect(validateDate("2026-99-99")).toBeNull();
	});
});

// ── validateTime ─────────────────────────────────────────────────────────────

describe("validateTime", () => {
	it("accepts '09:00'", () => {
		expect(validateTime("09:00")).toBeNull();
	});

	it("accepts '00:00'", () => {
		expect(validateTime("00:00")).toBeNull();
	});

	it("accepts '23:59'", () => {
		expect(validateTime("23:59")).toBeNull();
	});

	it("rejects '24:00' (hour out of range)", () => {
		expect(validateTime("24:00")).not.toBeNull();
	});

	it("rejects '12:60' (minute out of range)", () => {
		expect(validateTime("12:60")).not.toBeNull();
	});

	it("rejects '9:00' (missing leading zero)", () => {
		expect(validateTime("9:00")).not.toBeNull();
	});

	it("rejects non-numeric input", () => {
		expect(validateTime("abc")).not.toBeNull();
	});
});

// ── validateFuture ───────────────────────────────────────────────────────────

describe("validateFuture", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-03-01T12:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("accepts a timestamp 1 hour in the future", () => {
		expect(validateFuture("2026-03-01T13:00:00.000Z")).toBeNull();
	});

	it("rejects a timestamp in the past", () => {
		expect(validateFuture("2026-03-01T11:59:59.000Z")).not.toBeNull();
	});

	it("rejects a timestamp equal to now (not strictly after)", () => {
		expect(validateFuture("2026-03-01T12:00:00.000Z")).not.toBeNull();
	});
});

// ── validateInterval ─────────────────────────────────────────────────────────

describe("validateInterval", () => {
	it("accepts '1'", () => {
		expect(validateInterval("1")).toEqual({ value: 1, error: null });
	});

	it("trims whitespace before parsing", () => {
		expect(validateInterval("  2  ")).toEqual({ value: 2, error: null });
	});

	it("rejects '0'", () => {
		const r = validateInterval("0");
		expect(r.error).not.toBeNull();
	});

	it("rejects '-1'", () => {
		const r = validateInterval("-1");
		expect(r.error).not.toBeNull();
	});

	it("rejects non-numeric input", () => {
		const r = validateInterval("abc");
		expect(r.error).not.toBeNull();
	});

	it("truncates decimal via parseInt (1.5 → 1)", () => {
		// parseInt("1.5") === 1 — documented behaviour, not a validation error
		expect(validateInterval("1.5")).toEqual({ value: 1, error: null });
	});
});

// ── validateWeekdays ─────────────────────────────────────────────────────────

describe("validateWeekdays", () => {
	it("accepts a comma-separated list of valid days", () => {
		const r = validateWeekdays("Mon,Wed,Fri");
		expect(r.error).toBeNull();
		expect(r.value).toEqual(["Mon", "Wed", "Fri"]);
	});

	it("trims whitespace around each day", () => {
		const r = validateWeekdays("Mon, Wed");
		expect(r.error).toBeNull();
		expect(r.value).toEqual(["Mon", "Wed"]);
	});

	it("rejects lowercase day names (case-sensitive)", () => {
		const r = validateWeekdays("mon");
		expect(r.error).not.toBeNull();
	});

	it("rejects any list containing an invalid day", () => {
		const r = validateWeekdays("Foo,Mon");
		expect(r.error).not.toBeNull();
	});

	it("rejects empty string with 'Invalid day(s)' (not 'At least one weekday')", () => {
		// ''.split(',') === [''] — the empty string is itself an invalid day token
		const r = validateWeekdays("");
		expect(r.error).not.toBeNull();
		expect(r.error).toContain("Invalid day(s)");
	});
});

// ── validateWeekday ──────────────────────────────────────────────────────────

describe("validateWeekday", () => {
	it("accepts 'Mon'", () => {
		expect(validateWeekday("Mon")).toBeNull();
	});

	it("trims leading whitespace before validating", () => {
		expect(validateWeekday(" Mon")).toBeNull();
	});

	it("rejects lowercase 'monday'", () => {
		expect(validateWeekday("monday")).not.toBeNull();
	});

	it("rejects empty string", () => {
		expect(validateWeekday("")).not.toBeNull();
	});
});

// ── validateOrdinal ──────────────────────────────────────────────────────────

describe("validateOrdinal", () => {
	it.each([
		["1", 1],
		["2", 2],
		["3", 3],
		["4", 4],
	])("accepts '%s' as a valid ordinal", (raw, expected) => {
		expect(validateOrdinal(raw)).toEqual({ value: expected, error: null });
	});

	it("rejects '0'", () => {
		expect(validateOrdinal("0").error).not.toBeNull();
	});

	it("rejects '5'", () => {
		expect(validateOrdinal("5").error).not.toBeNull();
	});

	it("rejects non-numeric input", () => {
		expect(validateOrdinal("abc").error).not.toBeNull();
	});

	it("trims whitespace before parsing", () => {
		expect(validateOrdinal("  3  ")).toEqual({ value: 3, error: null });
	});
});
