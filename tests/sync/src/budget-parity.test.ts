import {
	addMoney,
	budgetMonthOf,
	budgetMonthView,
	type CategoryLike,
	isNegative,
	isZero,
	negateMoney,
	shiftCalendarDate,
	timesMoney,
} from "@hisaab/domain";
import fc from "fast-check";
import { v7 as uuidv7 } from "uuid";
import { beforeAll, describe, expect, it } from "vitest";

import { adminClient, signInNewUser } from "./users";

// #62: Budget threshold Notifications come from the database's `budget_levels`, so it must count a Budget and what's
// used of it exactly as the Budgets tab does (`budgetMonthView`): the same Budgets 80% or 100% used, by any data.
describe("Budget level parity", () => {
	const admin = adminClient();
	const household = uuidv7();
	const wallet = uuidv7();
	const parent = uuidv7();
	const child = uuidv7();
	const other = uuidv7();
	let author = "";
	let categories: CategoryLike[] = [];

	beforeAll(async () => {
		author = (await signInNewUser()).id;
		const steps = [
			() => admin.from("households").insert({ id: household, name: "Parity" }),
			() =>
				admin.from("memberships").insert({
					id: uuidv7(),
					household_id: household,
					user_id: author,
					role: "admin",
				}),
			() =>
				admin.from("wallets").insert({
					id: wallet,
					household_id: household,
					name: "Cash",
					type: "cash",
					currency: "PKR",
				}),
			() =>
				admin.from("categories").insert(
					[
						{ id: parent, parent_id: null, name: "P Food" },
						{ id: child, parent_id: parent, name: "P Snacks" },
						{ id: other, parent_id: null, name: "P Fuel" },
					].map((c) => ({
						...c,
						household_id: household,
						kind: "expense",
						icon: "gifts",
						color: "lime",
					})),
				),
		];
		for (const step of steps) {
			const { error } = await step();
			if (error) throw error;
		}
		const { data, error } = await admin
			.from("categories")
			.select("id, kind, parent_id, name, archived_at")
			.eq("household_id", household);
		if (error) throw error;
		categories = data as CategoryLike[];
	});

	const amount = fc
		.integer({ min: 0, max: 50_000 })
		.map((n) => (n / 100).toFixed(2));
	const category = fc.constantFrom(parent, child, other);

	it("SQL finds the same Budgets 80% or 100% used as the domain, for any Budgets and Entries", async () => {
		let reached = 0;
		await fc.assert(
			fc.asyncProperty(
				fc.integer({ min: 1, max: 28 }),
				fc.integer({ min: 0, max: 365 * 3 }),
				fc.array(
					fc.record({
						category,
						monthsBack: fc.integer({ min: 0, max: 3 }),
						amount: fc.option(amount, { freq: 4 }),
					}),
					{ maxLength: 6 },
				),
				fc.array(
					fc.record({
						category,
						monthsBack: fc.integer({ min: 0, max: 1 }),
						amount,
					}),
					{ maxLength: 3 },
				),
				fc.array(
					fc.record({
						category: fc.option(category, { freq: 6 }),
						amount: amount.filter((a) => a !== "0.00"),
						daysBack: fc.integer({ min: -5, max: 45 }),
					}),
					{ maxLength: 10 },
				),
				async (startDay, dayIndex, standingSpec, overrideSpec, entrySpec) => {
					const today = shiftCalendarDate("2025-01-01", dayIndex);
					const month = budgetMonthOf(today, startDay);
					const monthsBefore = (n: number) => {
						const [y, m] = month.split("-").map(Number) as [number, number];
						const index = y * 12 + m - 1 - n;
						return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
					};
					// Distinct times, so which was written last is never a tie.
					const at = (i: number) =>
						new Date(Date.UTC(2024, 0, 1) + i * 1000).toISOString();
					const standing = standingSpec.map((b, i) => ({
						id: uuidv7(),
						household_id: household,
						category_id: b.category,
						valid_from: monthsBefore(b.monthsBack),
						amount: b.amount,
						created_at: at(i),
					}));
					const overrides = overrideSpec.map((o, i) => ({
						id: uuidv7(),
						household_id: household,
						category_id: o.category,
						month: monthsBefore(o.monthsBack),
						amount: o.amount,
						created_at: at(100 + i),
					}));
					// Expenses in a Category, and Balance adjustments (no Category), which never count.
					const entries = entrySpec.map((e) => ({
						id: uuidv7(),
						household_id: household,
						wallet_id: wallet,
						kind: e.category === null ? "balance_adjustment" : "expense",
						amount: `-${e.amount}`,
						category_id: e.category,
						occurred_on: shiftCalendarDate(today, -e.daysBack),
						created_by: author,
					}));

					for (const table of ["budgets", "budget_overrides", "entries"]) {
						const { error } = await admin
							.from(table)
							.delete()
							.eq("household_id", household);
						if (error) throw error;
					}
					const writes = [
						() =>
							admin
								.from("households")
								.update({ budget_month_start_day: startDay })
								.eq("id", household),
						() => admin.from("budgets").insert(standing),
						() => admin.from("budget_overrides").insert(overrides),
						() => admin.from("entries").insert(entries),
					];
					for (const write of writes) {
						const { error } = await write();
						if (error) throw error;
					}

					const { data, error } = await admin.rpc("budget_levels", {
						target_household: household,
						today,
						start_day: startDay,
					});
					if (error) throw error;
					const fromSql = (
						data as { category_id: string; month: string; level: number }[]
					)
						.map((r) => `${r.category_id} ${r.month} ${r.level}`)
						.toSorted();

					const view = budgetMonthView({
						month,
						today,
						startDay,
						currency: "PKR",
						categories,
						standing,
						overrides,
						entries,
						items: [],
					});
					const fromDomain = view.budgets
						.flatMap(({ category: c, budget, used }) => {
							if (isZero(budget) || isNegative(budget)) return [];
							const over = (share: number) =>
								!isNegative(
									addMoney(
										timesMoney(used, share),
										negateMoney(timesMoney(budget, 4)),
									),
								);
							if (!isNegative(addMoney(used, negateMoney(budget))))
								return [`${c.id} ${month} 100`];
							return over(5) ? [`${c.id} ${month} 80`] : [];
						})
						.toSorted();

					expect(fromSql).toEqual(fromDomain);
					if (fromDomain.length > 0) reached += 1;
				},
			),
			{ numRuns: 40 },
		);
		// Not vacuous: some runs had a Budget at a threshold.
		expect(reached).toBeGreaterThan(0);
	});
});
