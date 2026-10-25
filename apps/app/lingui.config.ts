import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

// English at launch; every string still goes through Lingui so Urdu can follow without a rewrite (ADR-0008).
export default defineConfig({
	sourceLocale: "en",
	locales: ["en"],
	catalogs: [
		{ path: "<rootDir>/src/locales/{locale}/messages", include: ["src"] },
	],
	// File origins without line numbers, so moving code doesn't churn the catalog (CI checks it is current).
	format: formatter({ lineNumbers: false }),
});
