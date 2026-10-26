import { describe, expect, it } from "@jest/globals";

import { makeCategory } from "@/test/categories";
import { makeEntry } from "@/test/entries";

import { draftToParams, paramsToDraft, repeatEntry } from "./draft";
import type { WalletChoice } from "./types";

const wallets: WalletChoice[] = [
	{ id: "w1", name: "Cash", currency: "PKR", archived_at: null },
	{
		id: "w2",
		name: "Old",
		currency: "PKR",
		archived_at: "2026-10-01T00:00:00.000Z",
	},
];

describe("repeatEntry", () => {
	it("fills the description, amount, Category and Wallet", () => {
		expect(
			repeatEntry(
				makeEntry("e1", {
					description: "Bread",
					amount: "-120",
					category_id: "c2",
					wallet_id: "w1",
				}),
				[makeCategory("c2", "Groceries")],
				wallets,
				"PKR",
			),
		).toEqual({
			description: "Bread",
			amount: "120",
			categoryId: "c2",
			walletId: "w1",
		});
	});

	it("leaves out an archived Wallet and Category, keeping the amount", () => {
		expect(
			repeatEntry(
				makeEntry("e1", {
					description: "Bread",
					amount: "-120",
					category_id: "c2",
					wallet_id: "w2",
				}),
				[
					makeCategory("c2", "Groceries", {
						archived_at: "2026-10-01T00:00:00.000Z",
					}),
				],
				wallets,
				"PKR",
			),
		).toEqual({ description: "Bread", amount: "120", categoryId: "" });
	});
});

describe("draft route parameters", () => {
	it("carry a draft to the full form and back", () => {
		const draft = {
			kind: "income" as const,
			walletId: "w1",
			amount: "12.50",
			categoryId: "c4",
			description: "Refund",
			occurredOn: "2026-10-25",
		};
		expect(paramsToDraft(draftToParams(draft))).toEqual(draft);
	});

	it("drop what isn't well-formed", () => {
		expect(
			paramsToDraft({
				kind: "transfer",
				amount: "12,5",
				date: "2026-02-30",
				wallet: "w1",
			}),
		).toEqual({
			walletId: "w1",
		});
	});
});
