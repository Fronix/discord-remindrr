/**
 * Background scheduler worker.
 *
 * Every WORKER_INTERVAL_SECONDS it:
 *  1. Fetches due one-time reminders and sends them (marking as sent).
 *  2. Fetches due recurring reminders, sends them, and advances to next_run.
 *
 * Idempotency is enforced at the DB layer via conditional UPDATE (only updates
 * when status = 'scheduled'), so a crash-and-restart cannot send duplicates.
 */

import { writeFileSync } from "node:fs";
import {
	AllowedMentionsTypes,
	type Client,
	type GuildTextBasedChannel,
	type MessageCreateOptions,
} from "discord.js";
import { DateTime } from "luxon";
import { config } from "../config";
import {
	advanceRecurring,
	getDueOneTime,
	getDueRecurring,
	markFailed,
	markSent,
} from "../db/reminders";
import { computeNextRun } from "../recurrence/engine";
import type { Reminder } from "../types";

const GRACE_SECONDS = 0; // fire only when the scheduled time has passed

export function startWorker(client: Client): NodeJS.Timeout {
	const intervalMs = config.WORKER_INTERVAL_SECONDS * 1000;
	const timer = setInterval(() => tick(client), intervalMs);
	// Kick off immediately on start
	tick(client).catch((err) =>
		console.error("[worker] Initial tick error:", err),
	);
	return timer;
}

async function tick(client: Client): Promise<void> {
	try {
		await processOneTime(client);
		await processRecurring(client);
		writeFileSync("/tmp/health", "");
	} catch (err) {
		console.error("[worker] Tick error:", err);
	}
}

async function processOneTime(client: Client): Promise<void> {
	const due = getDueOneTime(GRACE_SECONDS);
	for (const reminder of due) {
		// Atomically claim this reminder — if another worker (or crash-restart)
		// already sent it, markSent returns false and we skip.
		const claimed = markSent(reminder.id);
		if (!claimed) continue;

		await deliver(client, reminder);
	}
}

async function processRecurring(client: Client): Promise<void> {
	const due = getDueRecurring(GRACE_SECONDS);
	for (const reminder of due) {
		// Compute next run before claiming, so we can pass it to advanceRecurring.
		if (!reminder.recurrence) {
			console.error(
				`[worker] Recurring reminder ${reminder.id} has no recurrence data`,
			);
			markFailed(reminder.id);
			continue;
		}
		let nextIso: string;
		try {
			const nextUtc = computeNextRun(
				DateTime.utc(),
				reminder.recurrence,
				reminder.timezone,
			);
			const iso = nextUtc.toISO();
			if (!iso) throw new Error("computeNextRun returned invalid DateTime");
			nextIso = iso;
		} catch (err) {
			console.error(
				`[worker] Could not compute next run for reminder ${reminder.id}:`,
				err,
			);
			markFailed(reminder.id);
			continue;
		}

		// Atomically advance — skip if already advanced by a concurrent process.
		const claimed = advanceRecurring(reminder.id, nextIso);
		if (!claimed) continue;

		await deliver(client, reminder);
	}
}

async function deliver(client: Client, reminder: Reminder): Promise<void> {
	try {
		const channel = await client.channels.fetch(reminder.channel_id);
		if (!channel || !channel.isTextBased() || channel.isDMBased()) {
			console.warn(
				`[worker] Channel ${reminder.channel_id} not found or not a guild text channel — failing reminder ${reminder.id}`,
			);
			markFailed(reminder.id);
			return;
		}
		const textChannel = channel as GuildTextBasedChannel;

		const sendOptions: MessageCreateOptions = {
			content: reminder.message_text,
			allowedMentions: {
				parse: config.ALLOW_EVERYONE_MENTIONS
					? [
							AllowedMentionsTypes.Everyone,
							AllowedMentionsTypes.Role,
							AllowedMentionsTypes.User,
						]
					: [AllowedMentionsTypes.Role, AllowedMentionsTypes.User],
			},
		};

		await textChannel.send(sendOptions);

		// Delete the "Reminder scheduled" confirmation message now that it has fired
		if (reminder.confirmation_message_id) {
			try {
				const msg = await textChannel.messages.fetch(
					reminder.confirmation_message_id,
				);
				await msg.delete();
			} catch {
				// Already deleted or missing permissions — not critical
			}
		}

		console.log(
			`[worker] Delivered reminder ${reminder.id} to channel ${reminder.channel_id}`,
		);
	} catch (err: unknown) {
		const code = (err as { code?: number }).code;
		// 10003 = Unknown Channel, 50013 = Missing Permissions
		if (code === 10003 || code === 50013) {
			console.warn(
				`[worker] Permanent delivery failure for reminder ${reminder.id} (code ${code})`,
			);
			markFailed(reminder.id);
		} else {
			// Transient error — log but don't mark failed so it retries next tick
			console.error(
				`[worker] Transient delivery error for reminder ${reminder.id}:`,
				err,
			);
		}
	}
}
