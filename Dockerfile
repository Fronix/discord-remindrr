# ── Build stage ────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

# better-sqlite3 needs native compilation tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

RUN pnpm run build

# Prune dev dependencies
RUN pnpm prune --prod

# ── Runtime stage ──────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

WORKDIR /app

COPY --from=builder /app/dist        ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Database lives on a named volume
VOLUME ["/data"]

ENV NODE_ENV=production \
    SQLITE_PATH=/data/reminders.db

ENTRYPOINT ["node", "dist/index.js"]
