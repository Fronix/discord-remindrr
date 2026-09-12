import type {
	ChatInputCommandInteraction,
	InteractionReplyOptions,
} from "discord.js";
import { MessageFlags } from "discord.js";
import { listByGuild } from "../db/reminders";
import { buildReminderListEmbed } from "../interactions/components";
import type { ReminderStatus } from "../types";

/** Embed descriptions cap at 4096 chars, so keep the page small enough to fit. */
const PAGE_SIZE = 15;

function ephemeral(content: string): InteractionReplyOptions {
	return { content, flags: MessageFlags.Ephemeral };
}

/**
 * Handles the /reminders slash command.
 * Lists reminders for the current guild as an ephemeral embed, optionally
 * narrowed to the caller's own reminders and/or to still-active ones.
 */
export async function handleListCommand(
	i: ChatInputCommandInteraction,
): Promise<void> {
	const guildId = i.guildId;
	if (!guildId) {
		await i.reply(
			ephemeral("This command can only be used inside a server channel."),
		);
		return;
	}

	const scope = i.options.getString("scope") ?? "all";
	const statusFilter = i.options.getString("status") ?? "active";

	const status: ReminderStatus | undefined =
		statusFilter === "active" ? "scheduled" : undefined;
	const creator_user_id = scope === "mine" ? i.user.id : undefined;

	const all = listByGuild({ guild_id: guildId, creator_user_id, status });
	const page = all.slice(0, PAGE_SIZE);

	const scopeLabel = [
		scope === "mine" ? "yours" : "this server",
		status ? "active" : "all statuses",
	].join(", ");

	await i.reply({
		embeds: [buildReminderListEmbed(page, { scopeLabel, total: all.length })],
		flags: MessageFlags.Ephemeral,
	});
}
