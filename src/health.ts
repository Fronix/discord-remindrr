import { existsSync } from "node:fs";
import type { Server } from "node:http";
import { createServer } from "node:http";
import { config } from "./config";

export function startHealthServer(): Server {
	const server = createServer((_req, res) => {
		const workerAlive = existsSync("/tmp/health");
		const status = workerAlive ? 200 : 503;
		res.writeHead(status, { "Content-Type": "text/plain" });
		res.end(workerAlive ? "ok" : "worker not ready");
	});

	server.listen(config.HEALTH_PORT, () => {
		console.log(`[health] Listening on port ${config.HEALTH_PORT}`);
	});

	return server;
}
