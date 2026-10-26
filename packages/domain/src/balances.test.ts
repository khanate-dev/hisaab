import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	adjustmentTo,
	countsInReports,
	effectOn,
	walletBalances,
	walletEffects,
} from "./balances";
import { addMoney, moneyEquals, parseMoney, sumMoney } from "./money";

// ADR-0002: a Wallet's Balance is its opening Balance adjustment plus every Entry touching it; never stored.

const amountText = fc
	.integer({ min: -10_000_000, max: 10_000_000 })
	.chain((units) =>
		fc
			.integer({ min: 0, max: 2 })
			.map((scale) => (units / 10 ** scale).toFixed(scale)),
	);
const wallets = [
	{ id: "cash", currency: "PKR" },
	{ id: "bank", currency: "PKR" },
	{ id: "card", currency: "USD" },
];
const entry = fc.record({
	wallet_id: fc.constantFrom("cash", "bank", "card"),
	amount: amountText,
});
const entries = fc.array(entry, { maxLength: 40 });

const totalFor = (
	walletId: string,
	currency: string,
	list: { wallet_id: string; amount: string }[],
) =>
	sumMoney(
		list
			.filter((e) => e.wallet_id === walletId)
			.map((e) => parseMoney(e.amount, currency)),
		currency,
	);

const balanceOf = (balances: ReturnType<typeof walletBalances>, id: string) => {
	const balance = balances.get(id);
	if (!balance) throw new Error(`no Balance for ${id}`);
	return balance;
};

describe("walletBalances", () => {
	it("is zero for a Wallet with no Entries", () => {
		const balances = walletBalances(wallets, []);
		for (const wallet of wallets)
			expect(balances.get(wallet.id)?.toString()).toBe("0");
	});

	it("is the sum of exactly that Wallet's Entries, in its currency", () => {
		fc.assert(
			fc.property(entries, (list) => {
				const balances = walletBalances(wallets, list);
				for (const { id, currency } of wallets) {
					expect(
						moneyEquals(balanceOf(balances, id), totalFor(id, currency, list)),
					).toBe(true);
				}
			}),
		);
	});

	it("doesn't depend on the order Entries arrive in", () => {
		fc.assert(
			fc.property(
				entries.chain((list) =>
					fc.tuple(
						fc.constant(list),
						fc.shuffledSubarray(list, {
							minLength: list.length,
							maxLength: list.length,
						}),
					),
				),
				([list, shuffled]) => {
					const a = walletBalances(wallets, list);
					const b = walletBalances(wallets, shuffled);
					for (const { id } of wallets)
						expect(moneyEquals(balanceOf(a, id), balanceOf(b, id))).toBe(true);
				},
			),
		);
	});

	it("moves by exactly a new Entry's amount, and only for its Wallet", () => {
		fc.assert(
			fc.property(entries, entry, (list, added) => {
				const before = walletBalances(wallets, list);
				const after = walletBalances(wallets, [...list, added]);
				for (const { id, currency } of wallets) {
					const expected =
						id === added.wallet_id
							? addMoney(
									balanceOf(before, id),
									parseMoney(added.amount, currency),
								)
							: balanceOf(before, id);
					expect(moneyEquals(balanceOf(after, id), expected)).toBe(true);
				}
			}),
		);
	});

	it("ignores Entries for Wallets it wasn't given", () => {
		const balances = walletBalances(
			[{ id: "cash", currency: "PKR" }],
			[{ wallet_id: "elsewhere", amount: "5" }],
		);
		expect(balances.get("cash")?.toString()).toBe("0");
		expect(balances.has("elsewhere")).toBe(false);
	});
});

// Transfers between the household's PKR Wallets: what leaves one arrives in the other.
const positiveText = fc
	.integer({ min: 1, max: 10_000_000 })
	.map((units) => (units / 100).toFixed(2));
const transfer = fc
	.tuple(fc.constantFrom("cash", "bank"), positiveText)
	.map(([from, moved]) => ({
		wallet_id: from,
		amount: `-${moved}`,
		to_wallet_id: from === "cash" ? "bank" : "cash",
		to_amount: moved,
	}));

describe("Transfers", () => {
	it("conserve the household's total: Transfers between its Wallets add up to nothing", () => {
		fc.assert(
			fc.property(
				entries,
				fc.array(transfer, { maxLength: 20 }),
				(list, moves) => {
					const before = walletBalances(wallets, list);
					const after = walletBalances(wallets, [...list, ...moves]);
					const pkrTotal = (balances: ReturnType<typeof walletBalances>) =>
						addMoney(balanceOf(balances, "cash"), balanceOf(balances, "bank"));
					expect(moneyEquals(pkrTotal(before), pkrTotal(after))).toBe(true);
					expect(
						moneyEquals(balanceOf(before, "card"), balanceOf(after, "card")),
					).toBe(true);
				},
			),
		);
	});

	it("touch both their Wallets, and other Entries only theirs", () => {
		fc.assert(
			fc.property(fc.oneof(entry, transfer), (e) => {
				const effects = walletEffects(e);
				const isTransfer = "to_wallet_id" in e;
				expect(effects).toHaveLength(isTransfer ? 2 : 1);
				for (const { walletId, amount } of effects)
					expect(effectOn(e, walletId)).toBe(amount);
			}),
		);
	});
});

describe("adjustmentTo", () => {
	it("is exactly the gap that brings the Balance to the actual amount", () => {
		fc.assert(
			fc.property(amountText, amountText, (balance, actual) => {
				const from = parseMoney(balance, "PKR");
				const to = parseMoney(actual, "PKR");
				expect(moneyEquals(addMoney(from, adjustmentTo(from, to)), to)).toBe(
					true,
				);
			}),
		);
	});
});

describe("countsInReports", () => {
	it("counts exactly spending and income, never Transfers, Balance adjustments or anything else", () => {
		fc.assert(
			fc.property(
				fc.oneof(
					fc.constantFrom(
						"expense",
						"income",
						"transfer",
						"balance_adjustment",
					),
					fc.string(),
				),
				(kind) => {
					expect(countsInReports(kind)).toBe(
						kind === "expense" || kind === "income",
					);
				},
			),
		);
	});
});

describe("a Transfer between currencies", () => {
	it("takes what left out of one Wallet and puts what arrived into the other", () => {
		fc.assert(
			fc.property(
				entries,
				positiveText,
				positiveText,
				(list, left, arrived) => {
					const move = {
						wallet_id: "bank",
						amount: `-${left}`,
						to_wallet_id: "card",
						to_amount: arrived,
					};
					const before = walletBalances(wallets, list);
					const after = walletBalances(wallets, [...list, move]);
					expect(
						moneyEquals(
							balanceOf(after, "bank"),
							addMoney(
								balanceOf(before, "bank"),
								parseMoney(`-${left}`, "PKR"),
							),
						),
					).toBe(true);
					expect(
						moneyEquals(
							balanceOf(after, "card"),
							addMoney(balanceOf(before, "card"), parseMoney(arrived, "USD")),
						),
					).toBe(true);
				},
			),
		);
	});
});
