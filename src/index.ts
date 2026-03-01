import "dotenv/config"; // no-op if dotenv isn't installed; env is set via Docker
import { createClient } from "./bot/client";
import { config } from "./config";
import { closeDb, getDb } from "./db/database";
import { purgeExpired } from "./interactions/state";
import { startWorker } from "./scheduler/worker";

async function main(): Promise<void> {
	console.log("[startup] Validating configuration…");
	// config import throws on missing required vars
	void config;

	console.log(`[startup] Opening database at ${config.SQLITE_PATH}…`);
	getDb(); // initialises and runs migrations

	console.log("[startup] Connecting to Discord…");
	const client = createClient();

	await client.login(config.DISCORD_TOKEN);

	console.log("[startup] Starting scheduler…");
	const workerTimer = startWorker(client);

	// Purge expired in-memory flow states every 5 minutes
	const purgeTimer = setInterval(purgeExpired, 5 * 60 * 1000);

	// ── Graceful shutdown ──────────────────────────────────────────────────
	const shutdown = async (signal: string): Promise<void> => {
		console.log(`\n[shutdown] Received ${signal}, shutting down…`);
		clearInterval(workerTimer);
		clearInterval(purgeTimer);
		client.destroy();
		closeDb();
		console.log("[shutdown] Done.");
		process.exit(0);
	};

	process.once("SIGINT", () => shutdown("SIGINT"));
	process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
	console.error("[fatal]", err);
	process.exit(1);
});
