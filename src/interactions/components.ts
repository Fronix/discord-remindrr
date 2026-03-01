import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	MessageFlags,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} from "discord.js";
import { DateTime } from "luxon";
import { describeOneTime, describeRecurrence } from "../recurrence/engine";
import type { Recurrence, Reminder } from "../types";

// ── Custom ID prefixes ─────────────────────────────────────────────────────

export const SEL_SCHED_TYPE = "rem_type";
export const SEL_WEEKDAYS = "rem_wd";
export const SEL_HOUR = "rem_hour";
export const SEL_MINUTE = "rem_min";
export const BTN_CREATE = "rem_create";
export const BTN_CANCEL = "cancel_reminder";

export const schedTypeId = (sid: string) => `${SEL_SCHED_TYPE}|${sid}`;
export const weekdaysId = (sid: string) => `${SEL_WEEKDAYS}|${sid}`;
export const hourId = (sid: string) => `${SEL_HOUR}|${sid}`;
export const minuteId = (sid: string) => `${SEL_MINUTE}|${sid}`;
export const createBtnId = (sid: string) => `${BTN_CREATE}|${sid}`;
export const cancelBtnId = (reminderId: number) =>
	`${BTN_CANCEL}|${reminderId}`;

// ── Weekday data ───────────────────────────────────────────────────────────

const WEEKDAY_LABELS: Record<string, string> = {
	Mon: "Monday",
	Tue: "Tuesday",
	Wed: "Wednesday",
	Thu: "Thursday",
	Fri: "Friday",
	Sat: "Saturday",
	Sun: "Sunday",
};

// ── Row builders ───────────────────────────────────────────────────────────

function buildScheduleTypeRow(sid: string) {
	return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		new StringSelectMenuBuilder()
			.setCustomId(schedTypeId(sid))
			.setPlaceholder("1. Schedule type…")
			.addOptions(
				new StringSelectMenuOptionBuilder()
					.setLabel("Once")
					.setDescription("Fire exactly once at a specific date and time")
					.setValue("one_time"),
				new StringSelectMenuOptionBuilder()
					.setLabel("Weekly")
					.setDescription("Repeat every N weeks on the selected day(s)")
					.setValue("weekly"),
				new StringSelectMenuOptionBuilder()
					.setLabel("Monthly – Nth weekday")
					.setDescription("E.g. 2nd Monday of every month")
					.setValue("monthly_nth"),
				new StringSelectMenuOptionBuilder()
					.setLabel("Monthly – last weekday")
					.setDescription("E.g. last Friday of every month")
					.setValue("monthly_last"),
			),
	);
}

function buildWeekdayRow(sid: string) {
	return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		new StringSelectMenuBuilder()
			.setCustomId(weekdaysId(sid))
			.setPlaceholder("2. Weekday(s)… (multi-select OK for weekly)")
			.setMinValues(1)
			.setMaxValues(7)
			.addOptions(
				Object.entries(WEEKDAY_LABELS).map(([val, label]) =>
					new StringSelectMenuOptionBuilder().setLabel(label).setValue(val),
				),
			),
	);
}

function buildHourRow(sid: string) {
	return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		new StringSelectMenuBuilder()
			.setCustomId(hourId(sid))
			.setPlaceholder("3. Hour…")
			.addOptions(
				Array.from({ length: 24 }, (_, h) =>
					new StringSelectMenuOptionBuilder()
						.setLabel(`${String(h).padStart(2, "0")}:xx`)
						.setValue(String(h))
						.setDefault(h === 12),
				),
			),
	);
}

function buildMinuteRow(sid: string) {
	return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		new StringSelectMenuBuilder()
			.setCustomId(minuteId(sid))
			.setPlaceholder("4. Minute…")
			.addOptions(
				[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) =>
					new StringSelectMenuOptionBuilder()
						.setLabel(`:${String(m).padStart(2, "0")}`)
						.setValue(String(m).padStart(2, "0"))
						.setDefault(m === 0),
				),
			),
	);
}

function buildCreateRow(sid: string) {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(createBtnId(sid))
			.setLabel("Create Reminder")
			.setStyle(ButtonStyle.Primary),
	);
}

// ── Schedule panel (ephemeral reply to /remind command) ────────────────────

export function buildSchedulePanel(sid: string, hint: string) {
	return {
		content: hint,
		components: [
			buildScheduleTypeRow(sid),
			buildWeekdayRow(sid),
			buildHourRow(sid),
			buildMinuteRow(sid),
			buildCreateRow(sid),
		] as unknown as ActionRowBuilder<StringSelectMenuBuilder>[],
		flags: MessageFlags.Ephemeral as const,
	};
}

// ── Confirmation embed + cancel button ─────────────────────────────────────

export function buildConfirmationEmbed(reminder: Reminder): EmbedBuilder {
	const scheduleDesc = reminder.is_repeating
		? describeRecurrence(reminder.recurrence as Recurrence)
		: describeOneTime(reminder.scheduled_at_utc ?? "", reminder.timezone);

	const nextRun = reminder.next_run_at_utc ?? reminder.scheduled_at_utc ?? "";
	const nextRunLocal = DateTime.fromISO(nextRun, { zone: "utc" })
		.setZone(reminder.timezone)
		.toFormat("cccc, LLLL d yyyy, HH:mm (ZZZZ)");

	return new EmbedBuilder()
		.setColor(0x5865f2)
		.setTitle("Reminder scheduled")
		.addFields(
			{ name: "Message", value: reminder.message_text },
			{ name: "Schedule", value: scheduleDesc },
			{ name: "Timezone", value: reminder.timezone, inline: true },
			{ name: "Next run", value: nextRunLocal, inline: true },
			{ name: "ID", value: String(reminder.id), inline: true },
		);
}

export function buildCancelButton(
	reminderId: number,
): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(cancelBtnId(reminderId))
			.setLabel("Cancel reminder")
			.setStyle(ButtonStyle.Danger),
	);
}

export function buildCancelledEmbed(reminder: Reminder): EmbedBuilder {
	return new EmbedBuilder()
		.setColor(0xed4245)
		.setTitle("Reminder cancelled")
		.addFields(
			{ name: "Message", value: reminder.message_text },
			{ name: "ID", value: String(reminder.id), inline: true },
		);
}
