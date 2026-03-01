# ── Build stage ────────────────────────────────────────────────────────────
FROM node:24-slim AS builder

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
FROM node:24-slim AS runtime

WORKDIR /app

COPY --from=builder /app/dist        ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

# Database lives on a named volume
VOLUME ["/data"]

ENV NODE_ENV=production \
    SQLITE_PATH=/data/reminders.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.HEALTH_PORT||3000) + '/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["sh", "entrypoint.sh"]
