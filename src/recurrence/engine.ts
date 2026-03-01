import { DateTime } from "luxon";
import type {
	Recurrence,
	RecurrenceMonthlyLast,
	RecurrenceMonthlyNth,
	RecurrenceWeekly,
} from "../types";

/** Luxon weekday numbers: Mon=1 … Sun=7 */
const WEEKDAY_NUM: Record<string, number> = {
	Mon: 1,
	Tue: 2,
	Wed: 3,
	Thu: 4,
	Fri: 5,
	Sat: 6,
	Sun: 7,
};

function parseTime(timeLocal: string): { hour: number; minute: number } {
	const [h, m] = timeLocal.split(":").map(Number);
	return { hour: h, minute: m };
}

function applyTime(dt: DateTime, timeLocal: string): DateTime {
	const { hour, minute } = parseTime(timeLocal);
	return dt.set({ hour, minute, second: 0, millisecond: 0 });
}

/**
 * Compute the next fire time for a recurring reminder, strictly after `afterUtc`.
 *
 * DST handling is delegated to Luxon:
 *  - Gap (spring forward): Luxon adjusts forward to the first valid local time.
 *  - Ambiguous (fall back): Luxon uses the first (pre-transition) occurrence.
 */
export function computeNextRun(
	afterUtc: DateTime,
	recurrence: Recurrence,
	timezone: string,
): DateTime {
	switch (recurrence.type) {
		case "weekly":
			return computeNextWeekly(afterUtc, recurrence, timezone);
		case "monthly":
			return computeNextMonthly(afterUtc, recurrence, timezone);
	}
}

// ── Weekly ─────────────────────────────────────────────────────────────────

function computeNextWeekly(
	afterUtc: DateTime,
	rec: RecurrenceWeekly,
	timezone: string,
): DateTime {
	const afterLocal = afterUtc.setZone(timezone);

	const sortedWds = [...rec.weekdays]
		.map((d) => WEEKDAY_NUM[d])
		.sort((a, b) => a - b);

	// ISO Monday = start of week
	const weekStart = afterLocal.startOf("week");

	// Check remaining matching weekdays in the current (valid) week
	for (const wd of sortedWds) {
		const candidate = applyTime(
			weekStart.plus({ days: wd - 1 }),
			rec.time_local,
		);
		if (candidate > afterLocal) {
			return candidate.toUTC();
		}
	}

	// No match in current week → advance by interval_weeks to next valid week,
	// then take the first matching weekday.
	const nextWeekStart = weekStart.plus({ weeks: rec.interval_weeks });
	const firstWd = sortedWds[0];
	const candidate = applyTime(
		nextWeekStart.plus({ days: firstWd - 1 }),
		rec.time_local,
	);
	return candidate.toUTC();
}

// ── Monthly ────────────────────────────────────────────────────────────────

function computeNextMonthly(
	afterUtc: DateTime,
	rec: RecurrenceMonthlyNth | RecurrenceMonthlyLast,
	timezone: string,
): DateTime {
	const afterLocal = afterUtc.setZone(timezone);

	// Check up to 24 months forward to be safe
	for (let offset = 0; offset <= 24; offset++) {
		const monthStart = afterLocal.plus({ months: offset }).startOf("month");

		const dayDt =
			rec.mode === "nth_weekday"
				? getNthWeekdayOfMonth(
						monthStart,
						WEEKDAY_NUM[rec.weekday],
						(rec as RecurrenceMonthlyNth).ordinal,
					)
				: getLastWeekdayOfMonth(monthStart, WEEKDAY_NUM[rec.weekday]);

		if (!dayDt) continue; // ordinal doesn't exist in this month

		const candidate = applyTime(dayDt, rec.time_local);
		if (candidate > afterLocal) {
			return candidate.toUTC();
		}
	}

	throw new Error(
		"computeNextMonthly: could not find next run within 24 months",
	);
}

/**
 * Returns the DateTime of the Nth occurrence of `weekdayNum` in the month
 * starting at `monthStart`, or null if that ordinal doesn't exist.
 */
function getNthWeekdayOfMonth(
	monthStart: DateTime,
	weekdayNum: number,
	ordinal: number,
): DateTime | null {
	// Walk from the 1st until we find the weekday
	let d = monthStart;
	while (d.weekday !== weekdayNum) {
		d = d.plus({ days: 1 });
	}
	// Advance (ordinal-1) more weeks
	const result = d.plus({ weeks: ordinal - 1 });
	return result.month === monthStart.month ? result : null;
}

/**
 * Returns the DateTime of the last occurrence of `weekdayNum` in the month.
 */
function getLastWeekdayOfMonth(
	monthStart: DateTime,
	weekdayNum: number,
): DateTime {
	// Start from the last day of the month and walk backwards
	const monthEnd = monthStart.endOf("month").startOf("day");
	let d = monthEnd;
	while (d.weekday !== weekdayNum) {
		d = d.minus({ days: 1 });
	}
	return d;
}

// ── Formatting ─────────────────────────────────────────────────────────────

/** Returns a human-readable description of the recurrence rule. */
export function describeRecurrence(rec: Recurrence): string {
	if (rec.type === "weekly") {
		const days = rec.weekdays.join(", ");
		const every =
			rec.interval_weeks === 1
				? "Every week"
				: `Every ${rec.interval_weeks} weeks`;
		return `${every} on ${days} at ${rec.time_local}`;
	}

	if (rec.mode === "nth_weekday") {
		const ord =
			["1st", "2nd", "3rd", "4th"][rec.ordinal - 1] ?? `${rec.ordinal}th`;
		const every =
			rec.interval_months === 1
				? "Every month"
				: `Every ${rec.interval_months} months`;
		return `${every} on the ${ord} ${rec.weekday} at ${rec.time_local}`;
	}

	// last_week
	const every =
		rec.interval_months === 1
			? "Every month"
			: `Every ${rec.interval_months} months`;
	return `${every} on the last ${rec.weekday} at ${rec.time_local}`;
}

/** Returns a human-readable description for a one-time reminder. */
export function describeOneTime(
	scheduledAtUtc: string,
	timezone: string,
): string {
	const local = DateTime.fromISO(scheduledAtUtc, { zone: "utc" }).setZone(
		timezone,
	);
	return local.toFormat("cccc, LLLL d yyyy, HH:mm (ZZZZ)");
}
