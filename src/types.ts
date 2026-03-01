export type ReminderStatus = "scheduled" | "sent" | "cancelled" | "failed";

export interface RecurrenceWeekly {
	type: "weekly";
	interval_weeks: number;
	weekdays: string[]; // e.g. ['Mon', 'Wed', 'Fri']
	time_local: string; // 'HH:MM' in 24h
}

export interface RecurrenceMonthlyNth {
	type: "monthly";
	mode: "nth_weekday";
	interval_months: number;
	ordinal: number; // 1-4
	weekday: string; // 'Mon'–'Sun'
	time_local: string;
}

export interface RecurrenceMonthlyLast {
	type: "monthly";
	mode: "last_week";
	interval_months: number;
	weekday: string;
	time_local: string;
}

export interface RecurrenceMonthlyLastDays {
	type: "monthly";
	mode: "last_days";
	interval_months: 1;
	time_local: string;
}

export type Recurrence =
	| RecurrenceWeekly
	| RecurrenceMonthlyNth
	| RecurrenceMonthlyLast
	| RecurrenceMonthlyLastDays;

export interface Reminder {
	id: number;
	guild_id: string;
	channel_id: string;
	creator_user_id: string;
	message_text: string;
	timezone: string;
	is_repeating: boolean;
	status: ReminderStatus;
	created_at_utc: string;
	updated_at_utc: string;
	last_run_at_utc: string | null;
	run_count: number;
	/** ISO UTC string, only for one-time reminders */
	scheduled_at_utc: string | null;
	/** Parsed recurrence rule, only for repeating reminders */
	recurrence: Recurrence | null;
	/** Pre-computed next fire time for repeating reminders */
	next_run_at_utc: string | null;
	/** Discord message ID of the public confirmation embed, for deletion after fire */
	confirmation_message_id: string | null;
}

/** State accumulated during a single /remind interaction session */
export interface RemindFlowState {
	sessionId: string;
	userId: string;
	/** Unix ms when this state entry expires (15 minutes) */
	expiresAt: number;
	// ── From slash command options ──────────────────────────────────────────
	message: string;
	timezone: string;
	/** YYYY-MM-DD – required for one_time schedule */
	date: string | null;
	/** Repeat every N weeks – for weekly schedule (default 1) */
	interval: number | null;
	/** Which occurrence 1–4 – for monthly_nth schedule */
	ordinal: number | null;
	// ── From select menus (updated via select interactions) ─────────────────
	scheduleType: string | null;
	weekdays: string[] | null;
	/** Hour "0"–"23", default "12" */
	hour: string;
	/** Minute "00"|"05"|…|"55", default "00" */
	minute: string;
}
