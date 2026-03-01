import { randomUUID } from "node:crypto";
import type {
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	InteractionReplyOptions,
} from "discord.js";
import { MessageFlags } from "discord.js";
import { config } from "../config";
import { buildSchedulePanel } from "../interactions/components";
import { initState } from "../interactions/state";
import { validateDate, validateTimezone } from "../interactions/validation";

function ephemeral(content: string): InteractionReplyOptions {
	return { content, flags: MessageFlags.Ephemeral };
}

/**
 * Handles the /remind slash command.
 * Parses options, validates text inputs, then replies with the
 * schedule panel (select menus + Create button) as an ephemeral message.
 */
export async function handleRemindCommand(
	i: ChatInputCommandInteraction,
): Promise<void> {
	const message = i.options.getString("message", true).trim();
	const timezone = (
		i.options.getString("timezone") ?? config.DEFAULT_TIMEZONE
	).trim();
	const date = i.options.getString("date")?.trim() ?? null;
	const interval = i.options.getInteger("interval") ?? null;
	const ordinal = i.options.getInteger("ordinal") ?? null;

	const tzErr = validateTimezone(timezone);
	if (tzErr) {
		await i.reply(ephemeral(`**Timezone error:** ${tzErr}`));
		return;
	}

	if (date) {
		const dateErr = validateDate(date);
		if (dateErr) {
			await i.reply(ephemeral(`**Date error:** ${dateErr}`));
			return;
		}
	}

	const sessionId = randomUUID().slice(0, 8);
	initState(sessionId, i.user.id, {
		message,
		timezone,
		date,
		interval,
		ordinal,
	});

	// Build hint showing what was captured from command options
	const lines = [`**Message:** ${message}`, `**Timezone:** ${timezone}`];
	if (date) lines.push(`**Date:** ${date} *(required for one-time)*`);
	if (interval !== null)
		lines.push(`**Interval:** every ${interval} week(s) *(weekly)*`);
	if (ordinal !== null)
		lines.push(`**Ordinal:** ${ordinal} *(monthly Nth weekday)*`);
	lines.push(
		"\nSelect a schedule type, weekday(s), and time, then click **Create Reminder**:",
	);

	await i.reply(buildSchedulePanel(sessionId, lines.join("\n")));
}

/**
 * Provides timezone autocomplete suggestions for the /remind `timezone` option.
 */
export async function handleRemindAutocomplete(
	i: AutocompleteInteraction,
): Promise<void> {
	const focused = i.options.getFocused(true);
	if (focused.name !== "timezone") return;

	const query = focused.value.toLowerCase();
	const all = Intl.supportedValuesOf("timeZone");
	const matches = query
		? all.filter((tz) => tz.toLowerCase().includes(query)).slice(0, 25)
		: all.slice(0, 25);

	await i.respond(matches.map((tz) => ({ name: tz, value: tz })));
}
