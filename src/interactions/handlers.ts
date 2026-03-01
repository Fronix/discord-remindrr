/**
 * Central router for all non-command interactions.
 * Handles:
 *  - Select menu interactions (schedule type, weekday, hour, minute)
 *  - Button interactions (create_reminder, cancel_reminder)
 */

import type {
	ButtonInteraction,
	InteractionReplyOptions,
	StringSelectMenuInteraction,
} from "discord.js";
import { MessageFlags } from "discord.js";
import { DateTime } from "luxon";
import {
	cancel,
	createOneTimeReminder,
	createRecurringReminder,
	getById,
	setConfirmationMessageId,
} from "../db/reminders";
import { computeNextRun } from "../recurrence/engine";
import type {
	RecurrenceMonthlyLast,
	RecurrenceMonthlyNth,
	RecurrenceWeekly,
} from "../types";
import {
	BTN_CANCEL,
	BTN_CREATE,
	buildCancelButton,
	buildCancelledEmbed,
	buildConfirmationEmbed,
	SEL_HOUR,
	SEL_MINUTE,
	SEL_SCHED_TYPE,
	SEL_WEEKDAYS,
} from "./components";
import { clearState, getState, patchState } from "./state";
import { validateFuture } from "./validation";

// ── Helpers ────────────────────────────────────────────────────────────────

function ephemeral(content: string): InteractionReplyOptions {
	return { content, flags: MessageFlags.Ephemeral };
}

// ── Select: schedule type ──────────────────────────────────────────────────

export async function handleScheduleTypeSelect(
	i: StringSelectMenuInteraction,
): Promise<void> {
	const [, sid] = i.customId.split("|");
	const state = getState(sid);
	if (!state || state.userId !== i.user.id) {
		await i.reply(
			ephemeral("Session expired or not yours. Run `/remind` again."),
		);
		return;
	}
	patchState(sid, { scheduleType: i.values[0] });
	await i.deferUpdate();
}

// ── Select: weekday(s) ─────────────────────────────────────────────────────

export async function handleWeekdaySelect(
	i: StringSelectMenuInteraction,
): Promise<void> {
	const [, sid] = i.customId.split("|");
	const state = getState(sid);
	if (!state || state.userId !== i.user.id) {
		await i.reply(
			ephemeral("Session expired or not yours. Run `/remind` again."),
		);
		return;
	}
	patchState(sid, { weekdays: i.values });
	await i.deferUpdate();
}

// ── Select: hour ───────────────────────────────────────────────────────────

export async function handleHourSelect(
	i: StringSelectMenuInteraction,
): Promise<void> {
	const [, sid] = i.customId.split("|");
	const state = getState(sid);
	if (!state || state.userId !== i.user.id) {
		await i.reply(
			ephemeral("Session expired or not yours. Run `/remind` again."),
		);
		return;
	}
	patchState(sid, { hour: i.values[0] });
	await i.deferUpdate();
}

// ── Select: minute ─────────────────────────────────────────────────────────

export async function handleMinuteSelect(
	i: StringSelectMenuInteraction,
): Promise<void> {
	const [, sid] = i.customId.split("|");
	const state = getState(sid);
	if (!state || state.userId !== i.user.id) {
		await i.reply(
			ephemeral("Session expired or not yours. Run `/remind` again."),
		);
		return;
	}
	patchState(sid, { minute: i.values[0] });
	await i.deferUpdate();
}

// ── Button: create reminder ────────────────────────────────────────────────

export async function handleCreateButton(i: ButtonInteraction): Promise<void> {
	const [, sid] = i.customId.split("|");
	const state = getState(sid);

	if (!state) {
		await i.reply(ephemeral("Session expired. Run `/remind` again."));
		return;
	}
	if (state.userId !== i.user.id) {
		await i.reply(ephemeral("This panel is not yours."));
		return;
	}

	const guildId = i.guildId;
	const channelId = i.channelId;
	if (!guildId || !channelId) {
		await i.reply(
			ephemeral("This command can only be used inside a server channel."),
		);
		return;
	}

	const { scheduleType, weekdays, hour, minute } = state;

	if (!scheduleType) {
		await i.reply(ephemeral("Please select a schedule type (step 1)."));
		return;
	}
	if (!weekdays || weekdays.length === 0) {
		await i.reply(ephemeral("Please select at least one weekday (step 2)."));
		return;
	}

	const time_local = `${hour.padStart(2, "0")}:${minute}`;

	const common = {
		guild_id: guildId,
		channel_id: channelId,
		creator_user_id: i.user.id,
		message_text: state.message,
		timezone: state.timezone,
	};

	if (scheduleType === "one_time") {
		if (!state.date) {
			await i.reply(
				ephemeral(
					"For a one-time reminder, provide the `date` option when running `/remind` (e.g. `date:2026-03-15`).",
				),
			);
			return;
		}

		const localDt = DateTime.fromISO(`${state.date}T${time_local}`, {
			zone: state.timezone,
		});
		if (!localDt.isValid) {
			await i.reply(
				ephemeral(`Could not parse date/time in timezone "${state.timezone}".`),
			);
			return;
		}

		const utcIso = localDt.toUTC().toISO();
		if (!utcIso) {
			await i.reply(ephemeral("Could not convert date/time to UTC."));
			return;
		}
		const futureErr = validateFuture(utcIso);
		if (futureErr) {
			await i.reply(ephemeral(`**Schedule error:** ${futureErr}`));
			return;
		}

		const reminder = createOneTimeReminder({
			...common,
			scheduled_at_utc: utcIso,
		});
		clearState(sid);
		await i.update({ content: "✅ Reminder created!", components: [] });
		const confirmMsg = await i.followUp({
			embeds: [buildConfirmationEmbed(reminder)],
			components: [buildCancelButton(reminder.id)],
		});
		setConfirmationMessageId(reminder.id, confirmMsg.id);
		return;
	}

	if (scheduleType === "weekly") {
		const recurrence: RecurrenceWeekly = {
			type: "weekly",
			interval_weeks: state.interval ?? 1,
			weekdays,
			time_local,
		};
		const nextRunUtc = computeNextRun(
			DateTime.utc(),
			recurrence,
			state.timezone,
		);
		const nextRunIso = nextRunUtc.toISO();
		if (!nextRunIso) {
			await i.reply(
				ephemeral("Could not compute next run time. Please try again."),
			);
			return;
		}
		const reminder = createRecurringReminder({
			...common,
			recurrence,
			next_run_at_utc: nextRunIso,
		});
		clearState(sid);
		await i.update({ content: "✅ Reminder created!", components: [] });
		const confirmMsg = await i.followUp({
			embeds: [buildConfirmationEmbed(reminder)],
			components: [buildCancelButton(reminder.id)],
		});
		setConfirmationMessageId(reminder.id, confirmMsg.id);
		return;
	}

	if (scheduleType === "monthly_nth") {
		if (!state.ordinal) {
			await i.reply(
				ephemeral(
					"For a monthly Nth-weekday reminder, provide the `ordinal` option when running `/remind` (e.g. `ordinal:2` for 2nd weekday).",
				),
			);
			return;
		}
		if (weekdays.length !== 1) {
			await i.reply(
				ephemeral("Please select exactly one weekday for a monthly schedule."),
			);
			return;
		}
		const recurrence: RecurrenceMonthlyNth = {
			type: "monthly",
			mode: "nth_weekday",
			interval_months: 1,
			ordinal: state.ordinal,
			weekday: weekdays[0],
			time_local,
		};
		const nextRunUtc = computeNextRun(
			DateTime.utc(),
			recurrence,
			state.timezone,
		);
		const nextRunIso = nextRunUtc.toISO();
		if (!nextRunIso) {
			await i.reply(
				ephemeral("Could not compute next run time. Please try again."),
			);
			return;
		}
		const reminder = createRecurringReminder({
			...common,
			recurrence,
			next_run_at_utc: nextRunIso,
		});
		clearState(sid);
		await i.update({ content: "✅ Reminder created!", components: [] });
		const confirmMsg = await i.followUp({
			embeds: [buildConfirmationEmbed(reminder)],
			components: [buildCancelButton(reminder.id)],
		});
		setConfirmationMessageId(reminder.id, confirmMsg.id);
		return;
	}

	if (scheduleType === "monthly_last") {
		if (weekdays.length !== 1) {
			await i.reply(
				ephemeral("Please select exactly one weekday for a monthly schedule."),
			);
			return;
		}
		const recurrence: RecurrenceMonthlyLast = {
			type: "monthly",
			mode: "last_week",
			interval_months: 1,
			weekday: weekdays[0],
			time_local,
		};
		const nextRunUtc = computeNextRun(
			DateTime.utc(),
			recurrence,
			state.timezone,
		);
		const nextRunIso = nextRunUtc.toISO();
		if (!nextRunIso) {
			await i.reply(
				ephemeral("Could not compute next run time. Please try again."),
			);
			return;
		}
		const reminder = createRecurringReminder({
			...common,
			recurrence,
			next_run_at_utc: nextRunIso,
		});
		clearState(sid);
		await i.update({ content: "✅ Reminder created!", components: [] });
		const confirmMsg = await i.followUp({
			embeds: [buildConfirmationEmbed(reminder)],
			components: [buildCancelButton(reminder.id)],
		});
		setConfirmationMessageId(reminder.id, confirmMsg.id);
		return;
	}

	await i.reply(ephemeral("Unknown schedule type."));
}

// ── Button: cancel reminder ────────────────────────────────────────────────

export async function handleCancelButton(i: ButtonInteraction): Promise<void> {
	const [, rawId] = i.customId.split("|");
	const reminderId = Number.parseInt(rawId, 10);

	if (Number.isNaN(reminderId)) {
		await i.reply(ephemeral("Invalid reminder ID."));
		return;
	}

	const reminder = getById(reminderId);
	if (!reminder) {
		await i.reply(ephemeral("Reminder not found."));
		return;
	}

	if (reminder.creator_user_id !== i.user.id) {
		await i.reply(
			ephemeral("Only the creator of this reminder can cancel it."),
		);
		return;
	}

	const cancelled = cancel(reminderId, i.user.id);
	if (!cancelled) {
		await i.reply(
			ephemeral("This reminder is no longer active and cannot be cancelled."),
		);
		return;
	}

	await i.update({
		embeds: [buildCancelledEmbed(reminder)],
		components: [],
	});
}

// ── Top-level routers ──────────────────────────────────────────────────────

export async function routeSelectMenu(
	i: StringSelectMenuInteraction,
): Promise<void> {
	const [prefix] = i.customId.split("|");
	switch (prefix) {
		case SEL_SCHED_TYPE:
			return handleScheduleTypeSelect(i);
		case SEL_WEEKDAYS:
			return handleWeekdaySelect(i);
		case SEL_HOUR:
			return handleHourSelect(i);
		case SEL_MINUTE:
			return handleMinuteSelect(i);
		default:
			console.warn(`Unknown select menu: ${i.customId}`);
	}
}

export async function routeButton(i: ButtonInteraction): Promise<void> {
	const [prefix] = i.customId.split("|");
	switch (prefix) {
		case BTN_CREATE:
			return handleCreateButton(i);
		case BTN_CANCEL:
			return handleCancelButton(i);
		default:
			console.warn(`Unknown button: ${i.customId}`);
	}
}
