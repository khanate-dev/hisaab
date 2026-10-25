import { schema } from "@hisaab/client-schema";
import { SqlSyncRules, StaticSchema } from "@powersync/service-sync-rules";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { stack } from "./stack";

// ADR-0009 drift checks between the three schema sources: Postgres, the Sync Streams and the client schema.

/** Postgres's public tables and columns, as PostgREST describes them to the service role. */
const postgresColumns = async () => {
	const response = await fetch(`${stack.supabaseUrl}/rest/v1/`, {
		headers: {
			apikey: stack.secretKey,
			Authorization: `Bearer ${stack.secretKey}`,
			Accept: "application/openapi+json",
		},
	});
	if (!response.ok) throw new Error(`PostgREST OpenAPI: ${response.status}`);
	const { definitions } = (await response.json()) as {
		definitions: Record<string, { properties: Record<string, unknown> }>;
	};
	return new Map(
		Object.entries(definitions).map(([table, { properties }]) => [
			table,
			Object.keys(properties),
		]),
	);
};

const syncConfig = readFileSync(
	fileURLToPath(
		new URL("../../../powersync/sync-config.yaml", import.meta.url),
	),
	"utf8",
);

describe("schema drift", () => {
	let postgres: Map<string, string[]>;
	beforeAll(async () => {
		postgres = await postgresColumns();
	});

	it("every synced client-schema column exists in Postgres", () => {
		for (const table of schema.tables.filter((t) => !t.localOnly)) {
			const columns = postgres.get(table.name);
			expect(columns, `Postgres table ${table.name}`).toBeDefined();
			for (const column of ["id", ...table.columns.map((c) => c.name)]) {
				expect(columns, `${table.name}.${column}`).toContain(column);
			}
		}
	});

	it("every synced client-schema column is selected by a Sync Stream", () => {
		for (const table of schema.tables.filter((t) => !t.localOnly)) {
			for (const column of ["id", ...table.columns.map((c) => c.name)]) {
				expect(
					syncConfig,
					`${table.name}.${column} in a stream's SELECT`,
				).toContain(`${table.name}.${column}`);
			}
		}
	});

	it("no client-schema column uses PowerSync's underscore prefix, which the connector never uploads", () => {
		for (const table of schema.tables) {
			expect(
				table.columns.map((c) => c.name).filter((name) => name.startsWith("_")),
			).toEqual([]);
		}
	});

	it("the Sync Streams reference only tables and columns that exist", () => {
		const source = new StaticSchema([
			{
				tag: "default",
				schemas: [
					{
						name: "public",
						tables: [...postgres].map(([name, columns]) => ({
							name,
							columns: columns.map((column) => ({
								name: column,
								pg_type: "text",
							})),
						})),
					},
				],
			},
		]);
		const { errors } = SqlSyncRules.fromYaml(syncConfig, {
			schema: source,
			defaultSchema: "public",
		});
		expect(errors.map((error) => error.message)).toEqual([]);
	});
});
