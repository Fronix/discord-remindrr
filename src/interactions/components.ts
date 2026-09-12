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
				new StringSelectMenuOptionBuilder()
					.setLabel("Monthly – last 3 days")
					.setDescription("Every day during the last 3 days of each month")
					.setValue("monthly_last_days"),
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

// ── Reminder list embed ────────────────────────────────────────────────────

const STATUS_ICON: Record<string, string> = {
	scheduled: "🟢",
	sent: "✅",
	cancelled: "🚫",
	failed: "⚠️",
};

/** Short one-line schedule summary used by the list and delete commands. */
export function describeSchedule(reminder: Reminder): string {
	return reminder.is_repeating
		? describeRecurrence(reminder.recurrence as Recurrence)
		: describeOneTime(reminder.scheduled_at_utc ?? "", reminder.timezone);
}

/** Next (or final) fire time rendered in the reminder's own timezone. */
export function formatNextRun(reminder: Reminder): string {
	const iso = reminder.next_run_at_utc ?? reminder.scheduled_at_utc;
	if (!iso) return "—";
	const local = DateTime.fromISO(iso, { zone: "utc" }).setZone(
		reminder.timezone,
	);
	if (!local.isValid) return "—";
	return local.toFormat("cccc, LLLL d yyyy, HH:mm (ZZZZ)");
}

function truncate(text: string, max: number): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Renders a page of reminders as a single embed.
 * `total` is the unpaged count so the footer can report what was left out.
 */
export function buildReminderListEmbed(
	reminders: Reminder[],
	opts: { scopeLabel: string; total: number },
): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setColor(0x5865f2)
		.setTitle(`Reminders — ${opts.scopeLabel}`);

	if (reminders.length === 0) {
		embed.setDescription("No reminders found.");
		return embed;
	}

	const lines = reminders.map((r) => {
		const icon = STATUS_ICON[r.status] ?? "•";
		const head = `${icon} **#${r.id}** — ${truncate(r.message_text, 80)}`;
		const when =
			r.status === "scheduled"
				? `Next: ${formatNextRun(r)}`
				: `Status: ${r.status}`;
		return `${head}\n<#${r.channel_id}> · <@${r.creator_user_id}>\n${describeSchedule(r)}\n${when}`;
	});

	embed.setDescription(lines.join("\n\n"));
	embed.setFooter({
		text:
			reminders.length < opts.total
				? `Showing ${reminders.length} of ${opts.total} · delete one with /remind-delete`
				: `${reminders.length} reminder(s) · delete one with /remind-delete`,
	});
	return embed;
}

// ── Deleted embed ──────────────────────────────────────────────────────────

export function buildDeletedEmbed(reminder: Reminder): EmbedBuilder {
	return new EmbedBuilder()
		.setColor(0xed4245)
		.setTitle("Reminder deleted")
		.addFields(
			{ name: "Message", value: truncate(reminder.message_text, 1000) },
			{ name: "Schedule", value: describeSchedule(reminder) },
			{ name: "ID", value: String(reminder.id), inline: true },
		);
}
