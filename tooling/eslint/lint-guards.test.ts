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
		["import { useQuery } from '@tanstack/react-query';"],
	])("rejects %s", async (code) => {
		expect(await errorsFor(file, `${code}\nexport {};\n`)).toContain(
			"no-restricted-imports",
		);
	});

	it("rejects dynamic imports", async () => {
		expect(
			await errorsFor(
				file,
				"export const load = () => import('react-native');\n",
			),
		).toContain("no-restricted-syntax");
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

describe("the upload connector stays framework-free", () => {
	it("rejects React Native imports in the connector", async () => {
		expect(
			await errorsFor(
				"apps/app/src/lib/powersync/connector.ts",
				"import { Platform } from 'react-native';\nexport { Platform };\n",
			),
		).toContain("no-restricted-imports");
	});
});

describe("app writes to synced tables carry their contract version", () => {
	const file = "apps/app/src/sample.ts";

	it.each([
		["db.insert(households).values({ id, name });"],
		["db.update(households).set({ name }).where(eq(households.id, id));"],
		["db.insert(households).values([{ id, name }]);"],
	])("rejects an unstamped write: %s", async (code) => {
		expect(await errorsFor(file, `${code}\nexport {};\n`)).toContain(
			"hisaab/stamp-local-writes",
		);
	});

	it.each([
		["db.insert(households).values(stamped({ id, name }));"],
		[
			"db.update(households).set(stamped({ name })).where(eq(households.id, id));",
		],
		["db.insert(households).values([stamped({ id, name })]);"],
		["db.insert(uploadErrors).values({ id });"],
		["new Set().values();"],
	])("accepts %s", async (code) => {
		expect(await errorsFor(file, `${code}\nexport {};\n`)).not.toContain(
			"hisaab/stamp-local-writes",
		);
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
			"export const q = 'SELECT SUM (amount) FROM entries';\n",
		],
		[
			"apps/app/src/sample.ts",
			"import { sum } from 'drizzle-orm';\nexport { sum };\n",
		],
		[
			"apps/app/src/sample.ts",
			"import * as d from 'drizzle-orm';\nexport const s = d.sum;\n",
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
