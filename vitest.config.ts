import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: false,
		environment: "node",
		pool: "forks",
		include: ["tests/**/*.test.ts"],
	},
});
