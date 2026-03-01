#!/bin/sh
if [ "${DEPLOY_COMMANDS}" = "true" ]; then
  echo "[entrypoint] Deploying slash commands..."
  node dist/bot/deploy.js
fi
exec node dist/index.js
