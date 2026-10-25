import js from "@eslint/js";
import pluginLingui from "eslint-plugin-lingui";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import { builtinModules } from "node:module";
import tseslint from "typescript-eslint";

import { logicalProperties } from "./tooling/eslint/logical-properties.js";
import { noSqlMoneyAggregates } from "./tooling/eslint/no-sql-money-aggregates.js";
import { stampLocalWrites } from "./tooling/eslint/stamp-local-writes.js";

/** Hisaab's own rules (tooling/eslint), one plugin object so every config block shares it. */
const hisaab = {
	rules: {
		"logical-properties": logicalProperties,
		"no-sql-money-aggregates": noSqlMoneyAggregates,
		"stamp-local-writes": stampLocalWrites,
	},
};

const DEVICE_CODE = [
	"apps/app/**/*.{ts,tsx}",
	"packages/client-schema/**/*.ts",
];

export default defineConfig(
	globalIgnores([
		"apps/app/src/locales/**/*.ts",
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
		// ADR-0008: logical properties only, so the layout mirrors for right-to-left languages.
		files: ["apps/app/src/**/*.{ts,tsx}"],
		plugins: { hisaab },
		rules: { "hisaab/logical-properties": "error" },
	},
	{
		// ADR-0008: every user-facing string goes through Lingui. Identifiers, routes, class names and test files aren't copy.
		// The UI layers; lib/ and theme/ hold identifiers, env names and log messages, not copy.
		files: ["apps/app/src/{app,components,features}/**/*.{ts,tsx}"],
		ignores: ["**/*.test.{ts,tsx}"],
		// The plugin's typings predate ESLint 10's Plugin type; the runtime shape is fine.
		plugins: {
			lingui: /** @type {import("eslint").ESLint.Plugin} */ (
				/** @type {unknown} */ (pluginLingui)
			),
		},
		rules: {
			...pluginLingui.configs["flat/recommended"].rules,
			"lingui/no-unlocalized-strings": [
				"error",
				{
					ignore: [
						// No letters, a kebab or dotted identifier, a route
						"^[^A-Za-z]*$",
						"^[a-z0-9]+([-_./:@][a-z0-9]+)+$",
						"^/",
					],
					ignoreNames: [
						{
							regex: {
								pattern:
									"className|ClassName|^(role|name|type|kind|href|route|variant|inputMode|autoComplete|autoCapitalize|accessibilityRole|testID|key)$",
							},
						},
						// UPPER_SNAKE constants hold class tables and keys, never copy; copy uses msg``.
						{
							regex: {
								pattern: "^[A-Z][A-Z0-9_]*$",
							},
						},
					],
					ignoreFunctions: [
						"Error",
						"console.*",
						"require",
						"*.addEventListener",
						"useQuickAdd",
						"router.push",
						"router.navigate",
						"navigation.emit",
						"navigation.navigate",
						"usePressIn",
						"hardShadow",
						"pressInStyle",
						// Marks a Tailwind class list, so class tables needn't be matched by pattern
						"classes",
					],
				},
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
		plugins: { hisaab },
		rules: {
			"hisaab/no-sql-money-aggregates": "error",
			"hisaab/stamp-local-writes": "error",
		},
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
