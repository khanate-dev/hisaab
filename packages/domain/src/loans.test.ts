import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { isSettled, type LoanDirection, loanOutstanding } from "./loans";
import {
	addMoney,
	isNegative,
	moneyEquals,
	negateMoney,
	parseMoney,
	sumMoney,
} from "./money";

const positive = fc
	.integer({ min: 1, max: 10_000_000 })
	.map((units) => (units / 100).toFixed(2));
const direction = fc.constantFrom<LoanDirection>("lent", "borrowed");

/** A Loan as Entries: its principal and Repayments, signed by their effect on the Wallet. */
const loan = fc
	.tuple(direction, positive, fc.array(positive, { maxLength: 10 }))
	.map(([way, principal, repaid]) => {
		const principalLeaves = way === "lent";
		return {
			way,
			principal,
			repaid,
			entries: [
				{ amount: principalLeaves ? `-${principal}` : principal },
				...repaid.map((r) => ({ amount: principalLeaves ? r : `-${r}` })),
			],
		};
	});
const money = (text: string) => parseMoney(text, "PKR");

describe("loanOutstanding", () => {
	it("is the principal less the Repayments, either way the money went", () => {
		fc.assert(
			fc.property(loan, ({ way, principal, repaid, entries }) => {
				const expected = addMoney(
					money(principal),
					negateMoney(sumMoney(repaid.map(money), "PKR")),
				);
				expect(
					moneyEquals(loanOutstanding(way, "PKR", entries), expected),
				).toBe(true);
			}),
		);
	});

	it("doesn't depend on the order the Repayments were made in", () => {
		fc.assert(
			fc.property(loan, ({ way, entries }) => {
				const reversed = entries.toReversed();
				expect(
					moneyEquals(
						loanOutstanding(way, "PKR", entries),
						loanOutstanding(way, "PKR", reversed),
					),
				).toBe(true);
			}),
		);
	});

	it("settles when a Repayment pays off exactly what's outstanding", () => {
		fc.assert(
			fc.property(loan, ({ way, entries }) => {
				const outstanding = loanOutstanding(way, "PKR", entries);
				fc.pre(!isNegative(outstanding));
				const payoff =
					way === "lent"
						? outstanding.toString()
						: negateMoney(outstanding).toString();
				const settled = loanOutstanding(way, "PKR", [
					...entries,
					{ amount: payoff },
				]);
				expect(isSettled(settled, false)).toBe(true);
			}),
		);
	});
});

describe("isSettled", () => {
	it("is settled when written off, whatever's outstanding, and otherwise only at zero or below", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: -1_000_000, max: 1_000_000 }),
				fc.boolean(),
				(units, writtenOff) => {
					const outstanding = money((units / 100).toFixed(2));
					expect(isSettled(outstanding, writtenOff)).toBe(
						writtenOff || units <= 0,
					);
				},
			),
		);
	});
});
