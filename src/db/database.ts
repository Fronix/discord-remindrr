import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "../config";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
	if (_db) return _db;

	const dbPath = config.SQLITE_PATH;
	const dir = path.dirname(dbPath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	_db = new Database(dbPath);
	_db.pragma("journal_mode = WAL");
	_db.pragma("foreign_keys = ON");
	_db.pragma("busy_timeout = 5000");

	runMigrations(_db);
	return _db;
}

export function closeDb(): void {
	if (_db) {
		_db.close();
		_db = null;
	}
}

function runMigrations(db: Database.Database): void {
	db.exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id          TEXT NOT NULL,
      channel_id        TEXT NOT NULL,
      creator_user_id   TEXT NOT NULL,
      message_text      TEXT NOT NULL,
      timezone          TEXT NOT NULL DEFAULT 'UTC',
      is_repeating      INTEGER NOT NULL DEFAULT 0,
      status            TEXT NOT NULL DEFAULT 'scheduled',
      created_at_utc    TEXT NOT NULL,
      updated_at_utc    TEXT NOT NULL,
      last_run_at_utc   TEXT,
      run_count         INTEGER NOT NULL DEFAULT 0,
      scheduled_at_utc  TEXT,
      recurrence        TEXT,
      next_run_at_utc   TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_rem_scheduled
      ON reminders(status, scheduled_at_utc)
      WHERE status = 'scheduled';

    CREATE INDEX IF NOT EXISTS idx_rem_next_run
      ON reminders(status, next_run_at_utc)
      WHERE status = 'scheduled';
  `);

	// Additive migrations — safe to re-run (ALTER TABLE fails silently if column exists)
	for (const sql of [
		"ALTER TABLE reminders ADD COLUMN confirmation_message_id TEXT",
	]) {
		try {
			db.exec(sql);
		} catch {
			// Column already exists — ignore
		}
	}
}
