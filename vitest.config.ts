import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Lets a project exist before its first test does.
		passWithNoTests: true,
		projects: [
			"packages/*/vitest.config.ts",
			{ test: { name: "tooling", include: ["tooling/**/*.test.ts"] } },
		],
	},
});
