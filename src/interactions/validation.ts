import { DateTime, IANAZone } from "luxon";

export const VALID_WEEKDAYS = [
	"Mon",
	"Tue",
	"Wed",
	"Thu",
	"Fri",
	"Sat",
	"Sun",
] as const;

/** Returns an error string or null if valid. */

export function validateTimezone(tz: string): string | null {
	if (!IANAZone.isValidZone(tz)) {
		return `"${tz}" is not a valid IANA timezone. Try "UTC" or "America/New_York".`;
	}
	return null;
}

export function validateDate(date: string): string | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		return "Date must be in YYYY-MM-DD format.";
	}
	return null;
}

export function validateTime(time: string): string | null {
	if (!/^\d{2}:\d{2}$/.test(time)) {
		return "Time must be in HH:MM format (24-hour).";
	}
	const [h, m] = time.split(":").map(Number);
	if (h < 0 || h > 23 || m < 0 || m > 59) {
		return "Time is out of range.";
	}
	return null;
}

export function validateFuture(utcIso: string): string | null {
	const dt = DateTime.fromISO(utcIso, { zone: "utc" });
	if (dt <= DateTime.utc()) {
		return "The scheduled time must be in the future.";
	}
	return null;
}

export function validateInterval(raw: string): {
	value: number;
	error: string | null;
} {
	const n = Number.parseInt(raw.trim(), 10);
	if (Number.isNaN(n) || n < 1) {
		return { value: 0, error: "Interval must be a whole number ≥ 1." };
	}
	return { value: n, error: null };
}

export function validateWeekdays(raw: string): {
	value: string[];
	error: string | null;
} {
	const parts = raw.split(",").map((p) => p.trim());
	const invalid = parts.filter(
		(p) => !(VALID_WEEKDAYS as readonly string[]).includes(p),
	);
	if (invalid.length > 0) {
		return {
			value: [],
			error: `Invalid day(s): ${invalid.join(", ")}. Use Mon Tue Wed Thu Fri Sat Sun.`,
		};
	}
	if (parts.length === 0) {
		return { value: [], error: "At least one weekday is required." };
	}
	return { value: parts, error: null };
}

export function validateWeekday(raw: string): string | null {
	const cleaned = raw.trim();
	if (!(VALID_WEEKDAYS as readonly string[]).includes(cleaned)) {
		return `"${cleaned}" is not valid. Use Mon Tue Wed Thu Fri Sat Sun.`;
	}
	return null;
}

export function validateOrdinal(raw: string): {
	value: number;
	error: string | null;
} {
	const n = Number.parseInt(raw.trim(), 10);
	if (Number.isNaN(n) || n < 1 || n > 4) {
		return { value: 0, error: "Ordinal must be 1, 2, 3, or 4." };
	}
	return { value: n, error: null };
}
