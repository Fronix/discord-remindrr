# discord-remind-bot

A Discord bot for scheduling one-time and recurring reminders via a single slash command.

## Features

- **One-time reminders**: schedule a message to be sent at a specific date and time
- **Recurring reminders**: weekly (every N weeks on selected days) or monthly (Nth weekday, or last week of the month)
- **Timezone-aware**: each reminder stores its own timezone with proper DST handling
- **Cancellable**: a cancel button is included with every confirmation message

## Usage

```
/remind message:<text> [timezone:<tz>] [date:<YYYY-MM-DD>] [interval:<N>] [ordinal:<1-4>]
```

After running the command, an ephemeral panel appears with four menus:

| Menu | Options |
|---|---|
| Schedule type | Once, Weekly, Monthly (Nth weekday), Monthly (last week) |
| Weekday(s) | Mon – Sun (multi-select) |
| Hour | 00 – 23 |
| Minute | :00, :05, … :55 |

Hit **Create Reminder** and the bot posts a public confirmation embed in the channel. At the scheduled time the bot delivers the message to the same channel.

## Setup

### 1. Create a Discord application and bot

Add a bot to your Discord application at [discord.com/developers](https://discord.com/developers/applications) and copy the bot token. Enable the **Server Members Intent** and **Message Content Intent** under the bot settings.

### 2. Invite the bot to your server

The bot requires the following permissions:

- `Send Messages`
- `Embed Links`
- `Read Message History`
- `Use Application Commands`

Use the OAuth2 URL Generator (scopes: `bot` + `applications.commands`) to generate an invite link.

### 3. Configure environment variables

Copy `.env.example` to `.env` and fill in the values:

```env
# Required
DISCORD_TOKEN=<token>
SQLITE_PATH=./data/reminders.db

# Push commands
DISCORD_GUILD_ID=<id>
DISCORD_CLIENT_ID=<id>

# Optional
DEFAULT_TIMEZONE=UTC                  # IANA timezone, e.g. Europe/London
WORKER_INTERVAL_SECONDS=30            # How often the scheduler checks for due reminders
ALLOW_EVERYONE_MENTIONS=false         # Whether @everyone/@here are allowed in reminder messages
```

### 4. Deploy slash commands

Register the `/remind` command with Discord (run once, or after command changes).

With Docker:

```sh
docker compose run --rm deploy-commands
```

Without Docker:

```sh
pnpm run deploy-commands
```

Set `DISCORD_GUILD_ID` in your `.env` to register commands to a specific guild only (instant, good for testing). Without it, commands are registered globally (may take up to an hour to propagate).

### 5. Run with Docker (recommended)

```sh
docker compose up -d
```

Data is persisted in a named Docker volume (`reminder_data`).

### Deploying on Coolify

1. Create a new resource using the **Docker Compose** build pack and point it at this repo.
2. Add all variables from `.env.example` via the Coolify environment variables UI.
3. Set `DEPLOY_COMMANDS=true` on the first deploy — the bot will register slash commands automatically before starting.
4. After the first successful deploy, set `DEPLOY_COMMANDS=false` (or leave it `true`, registration is idempotent and fast).

### Run without Docker

```sh
pnpm install
pnpm build
pnpm start
```

Or to run directly without compiling first (development):

```sh
pnpm dev
```
