import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	BACKUP_TABLES,
	type BackupRow,
	type BackupTable,
	backupJson,
	buildBackup,
	type FullBackup,
	readBackup,
	restorePlan,
} from "./full-backup";
import { occurrenceEntryId, occurrenceId } from "./recurring";

const HOUSEHOLD = {
	name: "Family",
	base_currency: "PKR",
	timezone: "Asia/Karachi",
	budget_month_start_day: 1,
};
const empty = (): Record<BackupTable, BackupRow[]> =>
	Object.fromEntries(BACKUP_TABLES.map((t) => [t, []])) as unknown as Record<
		BackupTable,
		BackupRow[]
	>;

// A whole household, every reference within it: what a device's local database holds.
const household = fc
	.record({
		wallets: fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 3 }),
		parents: fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 3 }),
		subs: fc.array(fc.tuple(fc.uuid(), fc.nat()), { maxLength: 3 }),
		contacts: fc.uniqueArray(fc.uuid(), { maxLength: 2 }),
		loans: fc.array(fc.tuple(fc.uuid(), fc.nat()), { maxLength: 2 }),
		rules: fc.array(fc.tuple(fc.uuid(), fc.nat(), fc.nat()), { maxLength: 3 }),
		entries: fc.array(
			fc.record({
				id: fc.uuid(),
				wallet: fc.nat(),
				category: fc.nat(),
				loan: fc.option(fc.nat()),
				amount: fc.stringMatching(/^-?\d{1,6}\.\d{2}$/),
			}),
			{ maxLength: 6 },
		),
		items: fc.array(fc.tuple(fc.uuid(), fc.nat(), fc.nat()), { maxLength: 4 }),
		occurrences: fc.array(
			fc.record({
				rule: fc.nat(),
				day: fc.integer({ min: 1, max: 28 }),
				confirmed: fc.boolean(),
				entryKept: fc.boolean(),
			}),
			{ maxLength: 4 },
		),
		attachments: fc.array(fc.tuple(fc.uuid(), fc.nat(), fc.boolean()), {
			maxLength: 3,
		}),
		archived: fc.array(fc.nat(), { maxLength: 3 }),
	})
	.map((g): FullBackup => {
		const at = "2026-10-01T00:00:00.000Z";
		const pick = <T>(list: readonly T[], n: number) => list[n % list.length];
		const tables = empty();
		tables.wallets = g.wallets.map((id) => ({
			id,
			name: "Cash",
			type: "cash",
			currency: "PKR",
			archived_at: null,
			created_at: at,
		}));
		const used = new Set([...g.wallets, ...g.parents, ...g.contacts]);
		const fresh = <T extends { 0: string }>(rows: T[]) =>
			rows.filter((r) => !used.has(r[0]) && used.add(r[0]));
		tables.categories = [
			...g.parents.map((id) => ({ id, parent_id: null as string | null })),
			...fresh(g.subs).map(([id, p]) => ({
				id,
				parent_id: pick(g.parents, p) ?? null,
			})),
		].map((c) => ({
			...c,
			kind: "expense",
			name: "Food",
			icon: "food",
			color: "lime",
			archived_at: null,
			created_at: at,
		}));
		tables.contacts = g.contacts.map((id) => ({
			id,
			name: "Bilal",
			archived_at: null,
			created_at: at,
		}));
		tables.loans =
			g.contacts.length === 0
				? []
				: fresh(g.loans).map(([id, c]) => ({
						id,
						contact_id: pick(g.contacts, c) ?? null,
						direction: "lent",
						due_on: null,
						written_off_at: null,
						notes: null,
						created_at: at,
					}));
		const categoryIds = tables.categories.map((c) => c.id);
		tables.recurring_rules = fresh(g.rules).map(([id, w, c]) => ({
			id,
			mode: w % 2 === 0 ? "auto" : "confirm",
			kind: "expense",
			wallet_id: pick(g.wallets, w) ?? null,
			category_id: pick(categoryIds, c) ?? null,
			amount: "100.00",
			description: null,
			frequency: "monthly",
			interval: 1,
			day_of_month: 1,
			starts_on: "2026-01-01",
			ends_on: null,
			created_by: "u-old",
			created_at: at,
		}));
		const loanIds = tables.loans.map((l) => l.id);
		const entry = (
			id: string,
			e: {
				wallet: number;
				category: number;
				loan: number | null;
				amount: string;
			},
		): BackupRow => ({
			id,
			wallet_id: pick(g.wallets, e.wallet) ?? null,
			to_wallet_id: null,
			loan_id: e.loan === null ? null : (pick(loanIds, e.loan) ?? null),
			link_id: "00000000-0000-7000-8000-00000000aaaa",
			// A Loan's: its principal, or (as a device may hold them, out of order) a Repayment.
			kind:
				e.loan === null || loanIds.length === 0
					? "expense"
					: e.wallet % 2 === 0
						? "repayment"
						: "loan_principal",
			amount: e.amount,
			to_amount: null,
			occurred_on: "2026-10-02",
			occurred_time: null,
			category_id: pick(categoryIds, e.category) ?? null,
			description: null,
			notes: null,
			created_by: "u-old",
			created_at: at,
		});
		tables.entries = fresh(g.entries.map((e) => [e.id, e] as const)).map(
			([id, e]) => entry(id, e),
		);
		const seen = new Set<string>();
		tables.occurrences = g.occurrences.flatMap((o) => {
			const rule = pick(tables.recurring_rules, o.rule);
			const due = `2026-03-${String(o.day).padStart(2, "0")}`;
			if (!rule || seen.has(`${rule.id}/${due}`)) return [];
			seen.add(`${rule.id}/${due}`);
			const entryId = occurrenceEntryId(rule.id, due);
			// A confirmed Occurrence's Entry, unless it was deleted on its own since.
			if (o.confirmed && o.entryKept)
				tables.entries.push(
					entry(entryId, {
						wallet: 0,
						category: 0,
						loan: null,
						amount: "-100.00",
					}),
				);
			return [
				{
					id: occurrenceId(rule.id, due),
					rule_id: rule.id,
					due_on: due,
					state: o.confirmed ? "confirmed" : "skipped",
					snoozed_until: null,
					entry_id: o.confirmed ? entryId : null,
					created_at: at,
				},
			];
		});
		const entryIds = tables.entries.map((e) => e.id);
		tables.entry_items =
			entryIds.length === 0
				? []
				: fresh(g.items).map(([id, e, c], i) => ({
						id,
						entry_id: pick(entryIds, e) ?? null,
						position: i,
						description: "Milk",
						amount: "10.00",
						quantity: null,
						category_id: pick(categoryIds, c) ?? null,
						rest: false,
						created_at: at,
					}));
		tables.attachments =
			entryIds.length === 0
				? []
				: fresh(g.attachments).map(([id, e, purged]) => ({
						id,
						entry_id: pick(entryIds, e) ?? null,
						media_type: "image/jpeg",
						size_bytes: 1000,
						file_name: null,
						thumbnail: null,
						purged_at: purged ? at : null,
						created_by: "u-old",
						created_at: at,
					}));
		tables.import_mappings = [
			{
				id: "00000000-0000-7000-8000-00000000bbbb",
				wallet_id: g.wallets[0] ?? null,
				mapping: "{}",
				created_at: at,
			},
		];
		for (const n of g.archived) {
			const category = pick(tables.categories, n);
			if (category) category.archived_at = at;
		}
		// Archiving a parent archives its Subcategories (the server's rule).
		for (const c of tables.categories)
			if (
				c.parent_id !== null &&
				tables.categories.some(
					(p) => p.id === c.parent_id && p.archived_at !== null,
				)
			)
				c.archived_at = at;
		return buildBackup(HOUSEHOLD, tables, at);
	});

const target = {
	householdId: "00000000-0000-7000-8000-00000000ffff",
	userId: "u-new",
};
const counter = () => {
	let n = 0;
	return () => `10000000-0000-7000-8000-${String((n += 1)).padStart(12, "0")}`;
};

describe("Full backup JSON", () => {
	it("reads back exactly what was written", () => {
		fc.assert(
			fc.property(household, (backup) => {
				expect(readBackup(backupJson(backup))).toEqual({ backup });
			}),
		);
	});

	it("leaves out the household's id and PowerSync's own columns", () => {
		const tables = empty();
		tables.wallets = [
			{
				id: "w1",
				household_id: "h1",
				name: "Cash",
				_metadata: "{}",
				_deleted: null,
			},
		];
		expect(buildBackup(HOUSEHOLD, tables, "t").tables.wallets).toEqual([
			{ id: "w1", name: "Cash" },
		]);
	});

	it("refuses what isn't a backup, one from a later app, and a damaged one", () => {
		const good = JSON.parse(backupJson(buildBackup(HOUSEHOLD, empty(), "t")));
		expect(readBackup("PK\u0003\u0004")).toEqual({ problem: "not_a_backup" });
		expect(readBackup(JSON.stringify({ ...good, format: "other" }))).toEqual({
			problem: "not_a_backup",
		});
		expect(readBackup(JSON.stringify({ ...good, version: 2 }))).toEqual({
			problem: "newer_version",
		});
		for (const damaged of [
			{ ...good, household: null },
			{ ...good, tables: { ...good.tables, entries: null } },
			{ ...good, tables: { ...good.tables, entries: [{ name: "no id" }] } },
			{
				...good,
				tables: { ...good.tables, entries: [{ id: "e1", nested: {} }] },
			},
		])
			expect(readBackup(JSON.stringify(damaged))).toEqual({
				problem: "damaged",
			});
	});
});

describe("restorePlan", () => {
	const restoredRows = (plan: ReturnType<typeof restorePlan>) => ({
		...plan.tables,
		attachments: plan.attachments.map((a) => a.row),
	});

	it("gives every row a new id in the new household, made by the restorer, references followed", () => {
		fc.assert(
			fc.property(household, (backup) => {
				const plan = restorePlan(backup, target, counter());
				const rows = restoredRows(plan);
				const oldIds = new Set(
					BACKUP_TABLES.flatMap((t) => backup.tables[t].map((r) => r.id)),
				);
				const idsOf = (t: BackupTable) => new Set(rows[t].map((r) => r.id));
				for (const t of BACKUP_TABLES)
					for (const row of rows[t]) {
						expect(oldIds.has(row.id)).toBe(false);
						expect(row.household_id).toBe(target.householdId);
						if ("created_by" in row) expect(row.created_by).toBe(target.userId);
					}
				const refs: [BackupTable, string, BackupTable][] = [
					["categories", "parent_id", "categories"],
					["loans", "contact_id", "contacts"],
					["recurring_rules", "wallet_id", "wallets"],
					["recurring_rules", "category_id", "categories"],
					["entries", "wallet_id", "wallets"],
					["entries", "loan_id", "loans"],
					["entries", "category_id", "categories"],
					["entry_items", "entry_id", "entries"],
					["entry_items", "category_id", "categories"],
					["occurrences", "rule_id", "recurring_rules"],
					["attachments", "entry_id", "entries"],
					["import_mappings", "wallet_id", "wallets"],
				];
				for (const [t, column, to] of refs)
					for (const row of rows[t])
						if (row[column] !== null)
							expect(idsOf(to).has(String(row[column]))).toBe(true);
				for (const t of BACKUP_TABLES)
					expect(idsOf(t).size).toBe(rows[t].length);
			}),
		);
	});

	it("restores everything of a whole household, but Attachments whose files were purged", () => {
		fc.assert(
			fc.property(household, (backup) => {
				const rows = restoredRows(restorePlan(backup, target, counter()));
				for (const t of BACKUP_TABLES)
					expect(rows[t].length).toBe(
						t === "attachments"
							? backup.tables.attachments.filter((a) => a.purged_at === null)
									.length
							: backup.tables[t].length,
					);
			}),
		);
	});

	it("derives Occurrence ids, and the Entries they became, from the new rules", () => {
		fc.assert(
			fc.property(household, (backup) => {
				const plan = restorePlan(backup, target, counter());
				// A whole household keeps every row, in order, so old and new pair up by position.
				const newRule = new Map(
					backup.tables.recurring_rules.map((r, i) => [
						r.id,
						plan.tables.recurring_rules[i]?.id,
					]),
				);
				const oldEntries = new Set(backup.tables.entries.map((e) => e.id));
				const newEntries = new Set(plan.tables.entries.map((e) => e.id));
				backup.tables.occurrences.forEach((old, i) => {
					const restored = plan.tables.occurrences[i];
					const rule = String(newRule.get(String(old.rule_id)));
					const due = String(old.due_on);
					expect(restored?.rule_id).toBe(rule);
					expect(restored?.id).toBe(occurrenceId(rule, due));
					expect(restored?.entry_id).toBe(
						old.entry_id === null ? null : occurrenceEntryId(rule, due),
					);
					// Its Entry comes back under that id exactly when it was still there.
					if (old.entry_id !== null)
						expect(newEntries.has(occurrenceEntryId(rule, due))).toBe(
							oldEntries.has(String(old.entry_id)),
						);
				});
			}),
		);
	});

	it("restores Wallets, Categories and Contacts unarchived, to archive once the rest is in, Subcategories first", () => {
		fc.assert(
			fc.property(household, (backup) => {
				const plan = restorePlan(backup, target, counter());
				for (const t of ["wallets", "categories", "contacts"] as const)
					for (const row of plan.tables[t]) expect(row.archived_at).toBe(null);
				const archive = plan.afterwards.filter(
					(a) => "archived_at" in a.values,
				);
				expect(archive.length).toBe(
					backup.tables.categories.filter((c) => c.archived_at !== null).length,
				);
				const subs = new Set(
					plan.tables.categories
						.filter((c) => c.parent_id !== null)
						.map((c) => c.id),
				);
				const firstParent = archive.findIndex((a) => !subs.has(a.id));
				if (firstParent >= 0)
					expect(archive.slice(firstParent).every((a) => !subs.has(a.id))).toBe(
						true,
					);
			}),
		);
	});

	it("restores Auto-record rules as Confirm, to switch back once their Occurrences are in", () => {
		fc.assert(
			fc.property(household, (backup) => {
				const plan = restorePlan(backup, target, counter());
				for (const rule of plan.tables.recurring_rules)
					expect(rule.mode).toBe("confirm");
				backup.tables.recurring_rules.forEach((old, i) => {
					const id = plan.tables.recurring_rules[i]?.id;
					expect(
						plan.afterwards.some(
							(a) => a.id === id && a.values.mode === "auto",
						),
					).toBe(old.mode === "auto");
				});
			}),
		);
	});

	it("writes each Loan's principal before its Repayments, as the server checks them against it", () => {
		fc.assert(
			fc.property(household, (backup) => {
				const kinds = restorePlan(backup, target, counter()).tables.entries.map(
					(e) => e.kind,
				);
				const lastPrincipal = kinds.lastIndexOf("loan_principal");
				const firstRepayment = kinds.indexOf("repayment");
				if (lastPrincipal >= 0 && firstRepayment >= 0)
					expect(lastPrincipal).toBeLessThan(firstRepayment);
			}),
		);
	});

	it("breaks a cross-household transfer's link, its other half being in another household", () => {
		fc.assert(
			fc.property(household, (backup) => {
				for (const e of restorePlan(backup, target, counter()).tables.entries)
					expect(e.link_id).toBe(null);
			}),
		);
	});

	it("leaves out a row whose reference isn't in the backup, and whatever needs it", () => {
		const tables = empty();
		tables.wallets = [{ id: "w1", archived_at: null }];
		tables.categories = [{ id: "c1", parent_id: null, archived_at: null }];
		tables.entries = [
			{
				id: "e1",
				wallet_id: "w1",
				category_id: "c1",
				loan_id: "gone",
				to_wallet_id: null,
			},
			{
				id: "e2",
				wallet_id: "w1",
				category_id: "c1",
				loan_id: null,
				to_wallet_id: null,
			},
		];
		tables.entry_items = [
			{ id: "i1", entry_id: "e1", category_id: "c1" },
			{ id: "i2", entry_id: "e2", category_id: "c1" },
		];
		const plan = restorePlan(
			buildBackup(HOUSEHOLD, tables, "t"),
			target,
			counter(),
		);
		expect(plan.tables.entries).toHaveLength(1);
		expect(plan.tables.entry_items).toHaveLength(1);
		expect(plan.tables.entry_items[0]?.entry_id).toBe(
			plan.tables.entries[0]?.id,
		);
	});
});
