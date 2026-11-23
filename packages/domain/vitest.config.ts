import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "domain",
		include: ["src/**/*.test.ts"],
		setupFiles: ["./vitest.setup.ts"],
	},
});
