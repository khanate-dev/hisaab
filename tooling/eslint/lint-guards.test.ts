import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({
	cwd: fileURLToPath(new URL("../..", import.meta.url)),
});

const errorsFor = async (filePath: string, code: string) => {
	const [result] = await eslint.lintText(code, { filePath });
	return (result?.messages ?? [])
		.filter((m) => m.severity === 2)
		.map((m) => m.ruleId);
};

describe("domain package stays framework-free", () => {
	const file = "packages/domain/src/sample.ts";

	it.each([
		["import { useState } from 'react';"],
		["import { View } from 'react-native';"],
		["import Constants from 'expo-constants';"],
		["import { Stack } from 'expo-router';"],
		["import { readFile } from 'node:fs/promises';"],
		["import { readFile } from 'fs';"],
		["import { createClient } from '@supabase/supabase-js';"],
		["import { Schema } from '@powersync/common';"],
		["import { eq } from 'drizzle-orm';"],
	])("rejects %s", async (code) => {
		expect(await errorsFor(file, `${code}\nexport {};\n`)).toContain(
			"no-restricted-imports",
		);
	});

	it("rejects network and storage globals", async () => {
		expect(
			await errorsFor(file, "export const load = () => fetch('/x');\n"),
		).toContain("no-restricted-globals");
	});

	it("accepts plain TypeScript", async () => {
		expect(
			await errorsFor(file, "export const double = (n: number) => n * 2;\n"),
		).toEqual([]);
	});

	it("leaves the app free to import React Native", async () => {
		expect(
			await errorsFor(
				"apps/app/src/sample.tsx",
				"import { View } from 'react-native';\nexport { View };\n",
			),
		).toEqual([]);
	});
});

describe("device code never aggregates money in SQL", () => {
	it.each([
		[
			"apps/app/src/sample.ts",
			"export const q = 'SELECT SUM(amount) FROM entries';\n",
		],
		[
			"apps/app/src/sample.ts",
			"export const q = 'select avg(amount) from entries';\n",
		],
		[
			"apps/app/src/sample.ts",
			"export const q = `SELECT total(amount) FROM entries`;\n",
		],
		[
			"packages/client-schema/src/sample.ts",
			"import { sql } from 'drizzle-orm';\nexport const q = sql`SUM (${1})`;\n",
		],
		[
			"apps/app/src/sample.ts",
			"import { sum } from 'drizzle-orm';\nexport { sum };\n",
		],
		[
			"apps/app/src/sample.ts",
			"import { avgDistinct } from 'drizzle-orm';\nexport { avgDistinct };\n",
		],
	])("rejects %s: %s", async (file, code) => {
		expect(await errorsFor(file, code)).toContain(
			"hisaab/no-sql-money-aggregates",
		);
	});

	it.each([
		["export const q = 'SELECT count(*) FROM entries';\n"],
		["export const label = 'Total (PKR)';\n"],
		["import { count } from 'drizzle-orm';\nexport { count };\n"],
	])("accepts %s", async (code) => {
		expect(await errorsFor("apps/app/src/sample.ts", code)).toEqual([]);
	});

	it("does not apply outside device code", async () => {
		expect(
			await errorsFor(
				"tests/sync/sample.ts",
				"export const q = 'SELECT SUM(amount) FROM entries';\n",
			),
		).toEqual([]);
	});
});
