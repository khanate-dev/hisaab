import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import { builtinModules } from "node:module";
import tseslint from "typescript-eslint";

import { noSqlMoneyAggregates } from "./tooling/eslint/no-sql-money-aggregates.js";

const DEVICE_CODE = [
	"apps/app/**/*.{ts,tsx}",
	"packages/client-schema/**/*.ts",
];

export default defineConfig(
	globalIgnores([
		"**/node_modules",
		"**/dist",
		"**/.expo",
		"**/coverage",
		"supabase/.temp",
		"apps/app/public/@powersync",
	]),
	js.configs.recommended,
	tseslint.configs.strict,
	{
		languageOptions: { globals: globals.node },
		linterOptions: { reportUnusedDisableDirectives: "error" },
		rules: {
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
		},
	},
	{
		// Metro and Babel load these as CommonJS.
		files: ["apps/app/*.config.js"],
		languageOptions: { sourceType: "commonjs" },
		rules: { "@typescript-eslint/no-require-imports": "off" },
	},
	{
		files: ["apps/app/**/*.{ts,tsx}"],
		languageOptions: { globals: globals.browser },
		extends: [reactHooks.configs.flat["recommended-latest"]],
	},
	{
		files: DEVICE_CODE,
		plugins: {
			hisaab: { rules: { "no-sql-money-aggregates": noSqlMoneyAggregates } },
		},
		rules: { "hisaab/no-sql-money-aggregates": "error" },
	},
	{
		// tests/sync runs the app's upload connector in Node, so it can't reach React Native or Expo.
		files: ["apps/app/src/lib/powersync/connector.ts"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: [
								"react",
								"react-native",
								"react-native-*",
								"expo",
								"expo-*",
								"@expo/*",
								"@/*",
							],
							message:
								"The upload connector runs in tests/sync too; keep it framework-free.",
						},
					],
				},
			],
		},
	},
	{
		// The domain core is framework-free and does no I/O; adapters are injected.
		files: ["packages/domain/**/*.ts"],
		rules: {
			"no-restricted-syntax": [
				"error",
				{
					selector: "ImportExpression",
					message:
						"packages/domain imports statically; inject an adapter instead.",
				},
				{
					selector: "CallExpression[callee.name='require']",
					message:
						"packages/domain imports statically; inject an adapter instead.",
				},
			],
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: [
								"react",
								"react/*",
								"react-dom",
								"react-dom/*",
								"react-native",
								"react-native/*",
								"react-native-*",
								"@react-native/*",
								"expo",
								"expo/*",
								"expo-*",
								"@expo/*",
								"@supabase/*",
								"@tanstack/*",
								"@powersync/*",
								"drizzle-orm",
								"drizzle-orm/*",
								"node:*",
								...builtinModules,
							],
							message:
								"packages/domain is framework-free and does no I/O; inject an adapter instead.",
						},
					],
				},
			],
			"no-restricted-globals": [
				"error",
				...[
					"fetch",
					"XMLHttpRequest",
					"WebSocket",
					"localStorage",
					"sessionStorage",
					"indexedDB",
				].map((name) => ({
					name,
					message: "packages/domain does no I/O; inject an adapter instead.",
				})),
			],
		},
	},
);
