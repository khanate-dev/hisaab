import { defineProject } from "vitest/config";

// Runs against the local stack (`pnpm stack:up`); not part of the root `pnpm test`.
export default defineProject({
	test: {
		name: "sync",
		include: ["src/**/*.test.ts"],
		testTimeout: 30_000,
	},
});
