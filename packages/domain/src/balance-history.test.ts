import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { balanceHistory } from "./balance-history";
import { walletBalances } from "./balances";
import { addMoney, moneyEquals, parseMoney } from "./money";

// A Wallet's balance history: the running Balance after each of its Entries, oldest first (ADR-0002).

const amountText = fc
	.integer({ min: -1_000_000, max: 1_000_000 })
	.chain((units) =>
		fc
			.integer({ min: 0, max: 2 })
			.map((scale) => (units / 10 ** scale).toFixed(scale)),
	);
const day = fc
	.integer({ min: 1, max: 28 })
	.map((d) => `2026-10-${String(d).padStart(2, "0")}`);
const entries = fc.uniqueArray(
	fc.record({
		id: fc.uuid(),
		amount: amountText,
		occurred_on: day,
		created_at: fc.date().map((d) => d.toISOString()),
	}),
	{ selector: (e) => e.id, maxLength: 30 },
);

describe("balanceHistory", () => {
	it("ends at the Wallet's Balance", () => {
		fc.assert(
			fc.property(entries, (list) => {
				const history = balanceHistory(list, "PKR");
				const balance = walletBalances(
					[{ id: "w", currency: "PKR" }],
					list.map((e) => ({ ...e, wallet_id: "w" })),
				).get("w");
				const last = history.at(-1)?.balance ?? parseMoney("0", "PKR");
				expect(balance && moneyEquals(last, balance)).toBe(true);
			}),
		);
	});

	it("steps by exactly each Entry's amount", () => {
		fc.assert(
			fc.property(entries, (list) => {
				let previous = parseMoney("0", "PKR");
				for (const step of balanceHistory(list, "PKR")) {
					const entry = list.find((e) => e.id === step.entryId);
					expect(entry).toBeDefined();
					expect(
						moneyEquals(
							step.balance,
							addMoney(previous, parseMoney(entry?.amount ?? "0", "PKR")),
						),
					).toBe(true);
					previous = step.balance;
				}
			}),
		);
	});

	it("runs in date order, then by when each Entry was recorded", () => {
		fc.assert(
			fc.property(entries, (list) => {
				const keys = balanceHistory(list, "PKR").map((step) => {
					const entry = list.find((e) => e.id === step.entryId);
					return `${entry?.occurred_on} ${entry?.created_at} ${entry?.id}`;
				});
				expect(keys).toEqual([...keys].sort());
			}),
		);
	});

	it("has one step per Entry", () => {
		fc.assert(
			fc.property(entries, (list) => {
				expect(
					balanceHistory(list, "PKR")
						.map((s) => s.entryId)
						.sort(),
				).toEqual(list.map((e) => e.id).sort());
			}),
		);
	});
});
