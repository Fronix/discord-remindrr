import type {
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	InteractionReplyOptions,
} from "discord.js";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { getById, listByGuild, remove } from "../db/reminders";
import {
	buildDeletedEmbed,
	describeSchedule,
} from "../interactions/components";
import type { Reminder } from "../types";

function ephemeral(content: string): InteractionReplyOptions {
	return { content, flags: MessageFlags.Ephemeral };
}

/**
 * Best-effort removal of the public confirmation embed that was posted when the
 * reminder was created. Failures (message already gone, missing permissions)
 * are ignored — the row is deleted either way.
 */
async function deleteConfirmationMessage(
	i: ChatInputCommandInteraction,
	reminder: Reminder,
): Promise<void> {
	if (!reminder.confirmation_message_id) return;
	try {
		const channel = await i.client.channels.fetch(reminder.channel_id);
		if (!channel?.isTextBased()) return;
		await channel.messages.delete(reminder.confirmation_message_id);
	} catch {
		// Message already deleted or inaccessible — nothing to clean up.
	}
}

/**
 * Handles the /remind-delete slash command.
 * Permanently removes a reminder. The creator can always delete their own;
 * anyone else needs the Manage Server permission.
 */
export async function handleDeleteCommand(
	i: ChatInputCommandInteraction,
): Promise<void> {
	const guildId = i.guildId;
	if (!guildId) {
		await i.reply(
			ephemeral("This command can only be used inside a server channel."),
		);
		return;
	}

	const reminderId = i.options.getInteger("id", true);
	const reminder = getById(reminderId);

	// Guild check first so IDs from other servers look identical to missing ones.
	if (!reminder || reminder.guild_id !== guildId) {
		await i.reply(ephemeral(`No reminder with ID \`${reminderId}\` found.`));
		return;
	}

	const isCreator = reminder.creator_user_id === i.user.id;
	const isManager =
		i.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
	if (!isCreator && !isManager) {
		await i.reply(
			ephemeral(
				"Only the creator of this reminder, or a member with **Manage Server**, can delete it.",
			),
		);
		return;
	}

	if (!remove(reminderId, guildId)) {
		await i.reply(
			ephemeral("Could not delete that reminder — it may already be gone."),
		);
		return;
	}

	await deleteConfirmationMessage(i, reminder);

	await i.reply({
		embeds: [buildDeletedEmbed(reminder)],
		flags: MessageFlags.Ephemeral,
	});
}

/** Discord caps autocomplete choice names at 100 characters. */
function choiceName(r: Reminder): string {
	const label = `#${r.id} · ${r.message_text.replace(/\s+/g, " ").trim()} — ${describeSchedule(r)}`;
	return label.length > 100 ? `${label.slice(0, 99)}…` : label;
}

/**
 * Suggests deletable reminders for the /remind-delete `id` option.
 * Non-managers only see their own reminders.
 */
export async function handleDeleteAutocomplete(
	i: AutocompleteInteraction,
): Promise<void> {
	const focused = i.options.getFocused(true);
	if (focused.name !== "id" || !i.guildId) {
		await i.respond([]);
		return;
	}

	const isManager =
		i.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
	const candidates = listByGuild({
		guild_id: i.guildId,
		creator_user_id: isManager ? undefined : i.user.id,
		status: "scheduled",
	});

	const query = focused.value.toString().toLowerCase();
	const matches = candidates
		.filter(
			(r) =>
				!query ||
				String(r.id).startsWith(query) ||
				r.message_text.toLowerCase().includes(query),
		)
		.slice(0, 25)
		.map((r) => ({
			name: choiceName(r),
			value: r.id,
		}));

	await i.respond(matches);
}
