/**
 * Registers slash commands with Discord.
 * Run once (or when commands change): pnpm run deploy-commands
 *
 * Requires DISCORD_TOKEN and DISCORD_CLIENT_ID in the environment.
 * Optionally set DISCORD_GUILD_ID to register to a single guild (instant).
 * Without it, commands register globally (up to 1 hour propagation delay).
 */

import "dotenv/config";
import { REST, Routes, SlashCommandBuilder } from "discord.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
	console.error("DISCORD_TOKEN and DISCORD_CLIENT_ID are required.");
	process.exit(1);
}

const commands = [
	new SlashCommandBuilder()
		.setName("remind")
		.setDescription("Schedule a reminder message in this channel")
		.setDefaultMemberPermissions(0n)
		.setDMPermission(false)
		.addStringOption((o) =>
			o
				.setName("message")
				.setDescription("The reminder message text")
				.setRequired(true),
		)
		.addStringOption((o) =>
			o
				.setName("timezone")
				.setDescription(
					"Timezone (e.g. Europe/Stockholm). Defaults to server default.",
				)
				.setAutocomplete(true),
		)
		.addStringOption((o) =>
			o
				.setName("date")
				.setDescription(
					"Date for a one-time reminder (YYYY-MM-DD, e.g. 2026-03-15)",
				),
		)
		.addIntegerOption((o) =>
			o
				.setName("interval")
				.setDescription("Repeat every N weeks (weekly schedule only)")
				.setMinValue(1)
				.setMaxValue(52),
		)
		.addIntegerOption((o) =>
			o
				.setName("ordinal")
				.setDescription(
					"Which occurrence: 1=1st, 2=2nd, 3=3rd, 4=4th (monthly Nth weekday only)",
				)
				.setMinValue(1)
				.setMaxValue(4),
		)
		.toJSON(),
];

const rest = new REST().setToken(token);

async function deploy(): Promise<void> {
	console.log(`Registering ${commands.length} command(s)…`);

	// clientId is guaranteed non-null — process.exit above handles the null case
	const cid = clientId as string;
	if (guildId) {
		await rest.put(Routes.applicationGuildCommands(cid, guildId), {
			body: commands,
		});
		console.log(`Registered to guild ${guildId} (instant).`);
	} else {
		await rest.put(Routes.applicationCommands(cid), { body: commands });
		console.log("Registered globally (up to 1 hour to propagate).");
	}
}

deploy().catch((err) => {
	console.error("Failed to register commands:", err);
	process.exit(1);
});
