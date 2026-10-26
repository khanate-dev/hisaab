import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";

import { makeCategory } from "@/test/categories";
import { makeEntry } from "@/test/entries";
import { render } from "@/test/render";

import { EntryList } from "./entry-list";
import type { WalletChoice } from "./types";
import { toEntryViews } from "./views";

const wallets: WalletChoice[] = [
	{ id: "w1", name: "Cash", currency: "PKR", archived_at: null },
];
const categories = [
	makeCategory("c1", "Food"),
	makeCategory("c2", "Groceries", { parent_id: "c1" }),
	makeCategory("c4", "Salary", { kind: "income" }),
];
const entries = [
	makeEntry("e1", {
		occurred_on: "2026-10-20",
		description: "Bread",
		amount: "-120",
	}),
	makeEntry("e2", {
		occurred_on: "2026-10-25",
		kind: "income",
		category_id: "c4",
		amount: "90000",
	}),
	makeEntry("e3", {
		occurred_on: "2026-10-25",
		occurred_time: "08:00",
		description: "Milk",
	}),
	makeEntry("e4", {
		kind: "balance_adjustment",
		category_id: null,
		amount: "500",
		occurred_on: "2026-10-01",
	}),
];

describe("EntryList", () => {
	it("lists Entries newest first under their dates, each named by description, Category or kind", async () => {
		await render(
			<EntryList
				items={toEntryViews(entries, categories, wallets)}
				onOpen={() => {}}
			/>,
		);
		const rows = screen.getAllByRole("button");
		expect(rows).toHaveLength(4);
		expect(rows[0]).toHaveTextContent(/Milk/);
		expect(rows[1]).toHaveTextContent(/Salary/);
		expect(rows[2]).toHaveTextContent(/Bread.*Food › Groceries · Cash/);
		expect(rows[3]).toHaveTextContent(/Balance adjustment/);
		expect(screen.getAllByRole("heading")).toHaveLength(3);
	});

	it("opens an Entry", async () => {
		const onOpen = jest.fn();
		await render(
			<EntryList
				items={toEntryViews(entries, categories, wallets)}
				onOpen={onOpen}
			/>,
		);
		await userEvent.press(screen.getByRole("button", { name: /Bread/ }));
		expect(onOpen).toHaveBeenCalledWith("e1");
	});

	it("says when there are none", async () => {
		await render(
			<EntryList
				items={[]}
				onOpen={() => {}}
			/>,
		);
		expect(screen.getByRole("status")).toHaveTextContent(/no entries/i);
	});
});
