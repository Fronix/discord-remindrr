import { DateTime } from "luxon";
import type { Recurrence, Reminder, ReminderStatus } from "../types";
import { getDb } from "./database";

// ── Helpers ────────────────────────────────────────────────────────────────

function now(): string {
	const iso = DateTime.utc().toISO();
	if (!iso) throw new Error("DateTime.utc() returned null ISO string");
	return iso;
}

function rowToReminder(row: Record<string, unknown>): Reminder {
	return {
		id: row.id as number,
		guild_id: row.guild_id as string,
		channel_id: row.channel_id as string,
		creator_user_id: row.creator_user_id as string,
		message_text: row.message_text as string,
		timezone: row.timezone as string,
		is_repeating: (row.is_repeating as number) === 1,
		status: row.status as ReminderStatus,
		created_at_utc: row.created_at_utc as string,
		updated_at_utc: row.updated_at_utc as string,
		last_run_at_utc: row.last_run_at_utc as string | null,
		run_count: row.run_count as number,
		scheduled_at_utc: row.scheduled_at_utc as string | null,
		recurrence: row.recurrence
			? (JSON.parse(row.recurrence as string) as Recurrence)
			: null,
		next_run_at_utc: row.next_run_at_utc as string | null,
		confirmation_message_id: row.confirmation_message_id as string | null,
	};
}

// ── Create ─────────────────────────────────────────────────────────────────

export interface CreateOneTimeParams {
	guild_id: string;
	channel_id: string;
	creator_user_id: string;
	message_text: string;
	timezone: string;
	scheduled_at_utc: string;
}

export function createOneTimeReminder(p: CreateOneTimeParams): Reminder {
	const db = getDb();
	const ts = now();
	const result = db
		.prepare(`
    INSERT INTO reminders
      (guild_id, channel_id, creator_user_id, message_text, timezone,
       is_repeating, status, created_at_utc, updated_at_utc, scheduled_at_utc)
    VALUES (?, ?, ?, ?, ?, 0, 'scheduled', ?, ?, ?)
  `)
		.run(
			p.guild_id,
			p.channel_id,
			p.creator_user_id,
			p.message_text,
			p.timezone,
			ts,
			ts,
			p.scheduled_at_utc,
		);
	const reminder = getById(result.lastInsertRowid as number);
	if (!reminder) throw new Error("Failed to fetch newly inserted reminder");
	return reminder;
}

export interface CreateRecurringParams {
	guild_id: string;
	channel_id: string;
	creator_user_id: string;
	message_text: string;
	timezone: string;
	recurrence: Recurrence;
	next_run_at_utc: string;
}

export function createRecurringReminder(p: CreateRecurringParams): Reminder {
	const db = getDb();
	const ts = now();
	const result = db
		.prepare(`
    INSERT INTO reminders
      (guild_id, channel_id, creator_user_id, message_text, timezone,
       is_repeating, status, created_at_utc, updated_at_utc, recurrence, next_run_at_utc)
    VALUES (?, ?, ?, ?, ?, 1, 'scheduled', ?, ?, ?, ?)
  `)
		.run(
			p.guild_id,
			p.channel_id,
			p.creator_user_id,
			p.message_text,
			p.timezone,
			ts,
			ts,
			JSON.stringify(p.recurrence),
			p.next_run_at_utc,
		);
	const reminder = getById(result.lastInsertRowid as number);
	if (!reminder) throw new Error("Failed to fetch newly inserted reminder");
	return reminder;
}

// ── Read ───────────────────────────────────────────────────────────────────

export function getById(id: number): Reminder | null {
	const db = getDb();
	const row = db.prepare("SELECT * FROM reminders WHERE id = ?").get(id) as
		| Record<string, unknown>
		| undefined;
	return row ? rowToReminder(row) : null;
}

/**
 * Returns due one-time reminders: status=scheduled, scheduled_at_utc <= now + graceSeconds
 */
export function getDueOneTime(graceSeconds = 60): Reminder[] {
	const db = getDb();
	const cutoff = DateTime.utc().plus({ seconds: graceSeconds }).toISO();
	if (!cutoff) throw new Error("Failed to compute cutoff ISO string");
	const rows = db
		.prepare(`
    SELECT * FROM reminders
    WHERE status = 'scheduled'
      AND is_repeating = 0
      AND scheduled_at_utc <= ?
    ORDER BY scheduled_at_utc ASC
  `)
		.all(cutoff) as Record<string, unknown>[];
	return rows.map(rowToReminder);
}

/**
 * Returns due recurring reminders: status=scheduled, next_run_at_utc <= now + graceSeconds
 */
export function getDueRecurring(graceSeconds = 60): Reminder[] {
	const db = getDb();
	const cutoff = DateTime.utc().plus({ seconds: graceSeconds }).toISO();
	if (!cutoff) throw new Error("Failed to compute cutoff ISO string");
	const rows = db
		.prepare(`
    SELECT * FROM reminders
    WHERE status = 'scheduled'
      AND is_repeating = 1
      AND next_run_at_utc <= ?
    ORDER BY next_run_at_utc ASC
  `)
		.all(cutoff) as Record<string, unknown>[];
	return rows.map(rowToReminder);
}

// ── Update ─────────────────────────────────────────────────────────────────

/** Mark a one-time reminder as sent (idempotent: only updates if still 'scheduled') */
export function markSent(id: number): boolean {
	const db = getDb();
	const ts = now();
	const info = db
		.prepare(`
    UPDATE reminders
    SET status = 'sent', updated_at_utc = ?, last_run_at_utc = ?, run_count = run_count + 1
    WHERE id = ? AND status = 'scheduled'
  `)
		.run(ts, ts, id);
	return info.changes === 1;
}

/** Advance a recurring reminder to the next run (idempotent: only updates if still 'scheduled') */
export function advanceRecurring(id: number, nextRunAtUtc: string): boolean {
	const db = getDb();
	const ts = now();
	const info = db
		.prepare(`
    UPDATE reminders
    SET next_run_at_utc = ?, updated_at_utc = ?, last_run_at_utc = ?, run_count = run_count + 1
    WHERE id = ? AND status = 'scheduled'
  `)
		.run(nextRunAtUtc, ts, ts, id);
	return info.changes === 1;
}

export function markFailed(id: number): void {
	const db = getDb();
	db.prepare(`
    UPDATE reminders SET status = 'failed', updated_at_utc = ? WHERE id = ?
  `).run(now(), id);
}

export function setConfirmationMessageId(id: number, messageId: string): void {
	getDb()
		.prepare("UPDATE reminders SET confirmation_message_id = ? WHERE id = ?")
		.run(messageId, id);
}

export function cancel(id: number, requestingUserId: string): boolean {
	const db = getDb();
	const info = db
		.prepare(`
    UPDATE reminders
    SET status = 'cancelled', updated_at_utc = ?
    WHERE id = ? AND creator_user_id = ? AND status = 'scheduled'
  `)
		.run(now(), id, requestingUserId);
	return info.changes === 1;
}
