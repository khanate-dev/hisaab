import { describe, expect, it } from "vitest";

import {
	contractChanges,
	contractFindings,
	contractRaise,
} from "./contract-check";

describe("contractChanges", () => {
	it.each([
		["alter table public.wallets drop column archived_at;", "drops a column"],
		["DROP TABLE public.old;", "drops a table"],
		["drop type public.kind;", "drops a type"],
		[
			"alter table public.entries alter column notes set not null;",
			"sets a column NOT NULL",
		],
		[
			"alter table public.entries alter column amount type text;",
			"changes a column's type",
		],
		[
			`drop policy "Members read" on public.entries;`,
			`drops the policy "members read"`,
		],
		[
			"update public.app_config set min_contract_version = 3 where id = 'app';",
			"raises min_contract_version to 3",
		],
	])("flags %s", (sql, reason) => {
		expect(contractChanges(sql)).toContain(reason);
	});

	it.each([
		["create table public.x (id uuid primary key, notes text not null);"],
		["alter table public.entries add column notes text;"],
		["alter table public.entries alter column notes drop not null;"],
		[
			"drop function if exists public.old_rpc(); drop trigger t on public.entries; drop index public.i;",
		],
		[
			`drop policy "Members read" on public.entries;\ncreate policy "Members read" on public.entries for select using (true);`,
		],
		[
			"-- once we drop table public.old, raise min_contract_version = 9\nselect 1;",
		],
	])("lets expand-only SQL through: %s", (sql) => {
		expect(contractChanges(sql)).toEqual([]);
	});
});

describe("contractRaise", () => {
	it("reads the highest version a migration raises to", () => {
		expect(
			contractRaise("update public.app_config set min_contract_version=2;"),
		).toBe(2);
		expect(
			contractRaise("select min_contract_version from public.app_config;"),
		).toBe(null);
	});
});

describe("contractFindings", () => {
	it("adds Squawk's contract rules for the file and leaves its other advice out", () => {
		expect(
			contractFindings(
				[{ file: "supabase/migrations/1_x.sql", sql: "select 1;" }],
				[
					{
						file: "/repo/supabase/migrations/1_x.sql",
						line: 4,
						rule_name: "constraint-missing-not-valid",
						message: "adding a constraint blocks writes",
					},
					{
						file: "/repo/supabase/migrations/1_x.sql",
						line: 0,
						rule_name: "prefer-robust-stmts",
						message: "missing if exists",
					},
				],
			),
		).toEqual([
			"supabase/migrations/1_x.sql:5: adding a constraint blocks writes (squawk constraint-missing-not-valid)",
		]);
	});
});
