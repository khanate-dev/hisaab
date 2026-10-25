import { defineConfig } from "@lingui/cli";

// English at launch; every string still goes through Lingui so Urdu can follow without a rewrite (ADR-0008).
export default defineConfig({
	sourceLocale: "en",
	locales: ["en"],
	catalogs: [
		{ path: "<rootDir>/src/locales/{locale}/messages", include: ["src"] },
	],
});
