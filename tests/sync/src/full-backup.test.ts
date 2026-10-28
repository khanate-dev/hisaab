import {
	BACKUP_TABLES,
	type BackupTable,
	buildBackup,
	occurrenceEntryId,
	occurrenceId,
	restorePlan,
} from "@hisaab/domain";
import { v7 as uuidv7 } from "uuid";
import { describe, expect, it } from "vitest";

import { seedHousehold } from "./seed";
import { adminClient, userClient } from "./users";

// #58: a Full backup restores into a new household through the same writes a device uploads, so the server must take
// every restored row from the restorer: the household marked restored (no template Categories), each row in the order
// the restore writes it, then the archiving.
describe("Full backup restore", () => {
	it("the server takes a whole household back from its backup, in the restorer's name", async () => {
		const admin = adminClient();
		const { users, household } = await seedHousehold({
			owner: "admin",
			restorer: "member",
		});
		const author = users.owner.id;
		const id = () => uuidv7();
		const at = "2026-10-01T00:00:00.000Z";

		// A household with a bit of everything: a parent Category and an archived Subcategory, an archived Wallet, a
		// Loan, a Budget and override, a rule with a confirmed Occurrence and its Entry, an itemized Expense, an
		// Attachment, a cross-household transfer half and an import mapping.
		const wallet = id();
		const oldWallet = id();
		const parent = id();
		const sub = id();
		const contact = id();
		const loan = id();
		const rule = id();
		const expense = id();
		const due = "2026-10-01";
		const write = async (table: string, rows: object[]) => {
			const { error } = await admin.from(table).insert(rows);
			if (error) throw new Error(`${table}: ${error.message}`);
		};
		await write("wallets", [
			{
				id: wallet,
				household_id: household,
				name: "Cash",
				type: "cash",
				currency: "PKR",
			},
			{
				id: oldWallet,
				household_id: household,
				name: "Old",
				type: "bank",
				currency: "PKR",
			},
		]);
		await write("categories", [
			{
				id: parent,
				household_id: household,
				kind: "expense",
				name: "B Food",
				icon: "food",
				color: "lime",
			},
			{
				id: sub,
				household_id: household,
				kind: "expense",
				parent_id: parent,
				name: "B Snacks",
				icon: "food",
				color: "lime",
			},
		]);
		await write("contacts", [
			{ id: contact, household_id: household, name: "Bilal" },
		]);
		await write("loans", [
			{
				id: loan,
				household_id: household,
				contact_id: contact,
				direction: "lent",
				due_on: "2026-12-01",
			},
		]);
		await write("budgets", [
			{
				id: id(),
				household_id: household,
				category_id: parent,
				valid_from: "2026-10",
				amount: "5000",
			},
		]);
		await write("budget_overrides", [
			{
				id: id(),
				household_id: household,
				category_id: parent,
				month: "2026-11",
				amount: "6000",
			},
		]);
		await write("recurring_rules", [
			{
				id: rule,
				household_id: household,
				kind: "expense",
				wallet_id: wallet,
				category_id: parent,
				amount: "1000",
				frequency: "monthly",
				day_of_month: 1,
				starts_on: "2026-09-01",
				created_by: author,
				created_at: "2026-09-01T00:00:00Z",
			},
		]);
		const entry = (extra: object) => ({
			household_id: household,
			wallet_id: wallet,
			occurred_on: "2026-10-02",
			created_by: author,
			...extra,
		});
		await write("entries", [
			entry({ id: id(), kind: "balance_adjustment", amount: "10000" }),
			entry({
				id: expense,
				kind: "expense",
				amount: "-150.00",
				category_id: parent,
			}),
			entry({
				id: occurrenceEntryId(rule, due),
				kind: "expense",
				amount: "-1000",
				category_id: parent,
				occurred_on: due,
			}),
			entry({
				id: id(),
				kind: "loan_principal",
				amount: "-2000",
				loan_id: loan,
			}),
			entry({ id: id(), kind: "repayment", amount: "500", loan_id: loan }),
			entry({
				id: id(),
				kind: "transfer",
				amount: "-100",
				to_wallet_id: oldWallet,
				to_amount: "100",
			}),
			entry({
				id: id(),
				kind: "household_transfer",
				amount: "-50",
				link_id: id(),
			}),
		]);
		await write("entry_items", [
			{
				id: id(),
				household_id: household,
				entry_id: expense,
				position: 0,
				description: "Chips",
				amount: "150.00",
				category_id: sub,
				rest: false,
			},
		]);
		await write("occurrences", [
			{
				id: occurrenceId(rule, due),
				household_id: household,
				rule_id: rule,
				due_on: due,
				state: "confirmed",
				entry_id: occurrenceEntryId(rule, due),
			},
		]);
		await write("attachments", [
			{
				id: id(),
				household_id: household,
				entry_id: expense,
				media_type: "image/jpeg",
				size_bytes: 1000,
				created_by: author,
			},
		]);
		await write("import_mappings", [
			{ id: id(), household_id: household, wallet_id: wallet, mapping: "{}" },
		]);
		// Archived last, as a device would have: the Subcategory with its parent, and the old Wallet.
		for (const [table, rowId] of [
			["categories", sub],
			["wallets", oldWallet],
		] as const) {
			const { error } = await admin
				.from(table)
				.update({ archived_at: at })
				.eq("id", rowId);
			if (error) throw error;
		}

		// The backup: what the owner's device holds of the household.
		const rows = Object.fromEntries(
			await Promise.all(
				BACKUP_TABLES.map(async (table) => {
					const { data, error } = await admin
						.from(table)
						.select("*")
						.eq("household_id", household);
					if (error) throw error;
					// Money comes back as numbers through PostgREST; a device holds it as exact text.
					return [
						table,
						data.map((row) =>
							Object.fromEntries(
								Object.entries(row).map(([k, v]) => [
									k,
									typeof v === "number" && ["amount", "to_amount"].includes(k)
										? String(v)
										: v,
								]),
							),
						),
					];
				}),
			),
		) as Record<BackupTable, Record<string, unknown>[]>;
		const backup = buildBackup(
			{
				name: "Family",
				base_currency: "PKR",
				timezone: "Asia/Karachi",
				budget_month_start_day: 1,
			},
			rows,
			at,
		);

		// Restored by someone else, in their name, through RLS.
		const restorer = userClient(users.restorer);
		const restored = uuidv7();
		const plan = restorePlan(
			backup,
			{ householdId: restored, userId: users.restorer.id },
			uuidv7,
		);
		const upload = async (table: string, values: object[]) => {
			for (const value of values) {
				const { error } = await restorer.from(table).insert(value);
				if (error) throw new Error(`${table}: ${error.message}`);
			}
		};
		await upload("households", [
			{
				id: restored,
				name: "Family (restored)",
				created_by: users.restorer.id,
				restored_at: at,
				base_currency: "PKR",
			},
		]);
		await upload("memberships", [
			{
				id: uuidv7(),
				household_id: restored,
				user_id: users.restorer.id,
				role: "admin",
			},
		]);
		for (const [table, values] of Object.entries(plan.tables))
			await upload(table, values);
		await upload(
			"attachments",
			plan.attachments.map((a) => a.row),
		);
		for (const { table, id: rowId, archived_at } of plan.archive) {
			const { data, error } = await restorer
				.from(table)
				.update({ archived_at })
				.eq("id", rowId)
				.select("id");
			if (error) throw error;
			expect(data).toHaveLength(1);
		}

		const count = async (table: string, of: string) => {
			const { count: n, error } = await admin
				.from(table)
				.select("id", { count: "exact", head: true })
				.eq("household_id", of);
			if (error) throw error;
			return n;
		};
		for (const table of BACKUP_TABLES)
			expect([table, await count(table, restored)]).toEqual([
				table,
				await count(table, household),
			]);
		const { data: archived } = await admin
			.from("categories")
			.select("name, archived_at")
			.eq("household_id", restored)
			.not("archived_at", "is", null);
		expect(archived?.map((c) => c.name)).toEqual(["B Snacks"]);
	});
});
