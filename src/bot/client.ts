import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import {
	handleRemindAutocomplete,
	handleRemindCommand,
} from "../commands/remind";
import { routeButton, routeSelectMenu } from "../interactions/handlers";

export function createClient(): Client {
	const client = new Client({
		intents: [GatewayIntentBits.Guilds],
	});

	client.once(Events.ClientReady, (c) => {
		console.log(`[bot] Logged in as ${c.user.tag}`);
	});

	client.on(Events.InteractionCreate, async (interaction) => {
		try {
			if (interaction.isChatInputCommand()) {
				if (interaction.commandName === "remind") {
					await handleRemindCommand(interaction);
				}
			} else if (interaction.isAutocomplete()) {
				if (interaction.commandName === "remind") {
					await handleRemindAutocomplete(interaction);
				}
			} else if (interaction.isStringSelectMenu()) {
				await routeSelectMenu(interaction);
			} else if (interaction.isButton()) {
				await routeButton(interaction);
			}
		} catch (err) {
			console.error("[bot] Unhandled interaction error:", err);
			// Attempt to notify user if possible
			try {
				const reply = {
					content: "An unexpected error occurred. Please try again.",
					flags: MessageFlags.Ephemeral,
				};
				if ("replied" in interaction && interaction.replied) return;
				if ("deferred" in interaction && interaction.deferred) {
					if ("followUp" in interaction)
						await (
							interaction as never as {
								followUp: (o: unknown) => Promise<void>;
							}
						).followUp(reply);
				} else if ("reply" in interaction) {
					await (
						interaction as never as { reply: (o: unknown) => Promise<void> }
					).reply(reply);
				}
			} catch {
				// ignore
			}
		}
	});

	return client;
}
