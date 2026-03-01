import path from "node:path";

// __dirname is src/ (tsx) or dist/ (compiled) — one level below the project root
const PROJECT_ROOT = path.resolve(__dirname, "..");

function required(key: string): string {
	const val = process.env[key];
	if (!val) throw new Error(`Missing required environment variable: ${key}`);
	return val;
}

function optional(key: string, fallback: string): string {
	return process.env[key] ?? fallback;
}

function optionalInt(key: string, fallback: number): number {
	const val = process.env[key];
	if (!val) return fallback;
	const n = Number.parseInt(val, 10);
	if (Number.isNaN(n))
		throw new Error(
			`Environment variable ${key} must be an integer, got: ${val}`,
		);
	return n;
}

function resolveDbPath(raw: string): string {
	return path.isAbsolute(raw) ? raw : path.resolve(PROJECT_ROOT, raw);
}

export const config = {
	DISCORD_TOKEN: required("DISCORD_TOKEN"),
	SQLITE_PATH: resolveDbPath(optional("SQLITE_PATH", "./data/reminders.db")),
	DEFAULT_TIMEZONE: optional("DEFAULT_TIMEZONE", "UTC"),
	WORKER_INTERVAL_SECONDS: optionalInt("WORKER_INTERVAL_SECONDS", 30),
	ALLOW_EVERYONE_MENTIONS:
		optional("ALLOW_EVERYONE_MENTIONS", "false").toLowerCase() === "true",
	HEALTH_PORT: optionalInt("HEALTH_PORT", 3000),
} as const;
