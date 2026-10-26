import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";
import { parseMoney } from "@hisaab/domain";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { makeCategory } from "@/test/categories";
import { makeEntry } from "@/test/entries";
import { render } from "@/test/render";

import { QuickAddForm } from "./quick-add-form";
import type { EntryDraft, WalletChoice } from "./types";

const wallets: WalletChoice[] = [
	{ id: "w1", name: "Cash", currency: "PKR", archived_at: null },
	{ id: "w2", name: "HBL", currency: "PKR", archived_at: null },
	{ id: "w3", name: "Dollars", currency: "USD", archived_at: null },
];
const categories = [
	makeCategory("c1", "Food"),
	makeCategory("c2", "Groceries", { parent_id: "c1" }),
	makeCategory("c3", "Travel"),
	makeCategory("c4", "Salary", { kind: "income" }),
];
const history = [
	makeEntry("e1", {
		description: "Bread",
		wallet_id: "w2",
		amount: "-120",
		category_id: "c2",
		occurred_on: "2026-10-20",
	}),
	makeEntry("e2", {
		description: "Bread",
		wallet_id: "w2",
		amount: "-130",
		category_id: "c2",
		occurred_on: "2026-10-22",
	}),
	makeEntry("e3", {
		description: "Bus",
		wallet_id: "w1",
		amount: "-60",
		category_id: "c3",
		occurred_on: "2026-10-25",
	}),
];

/** The ＋ and the sheet it opens: every press counts as a tap. */
const setup = async (
	props: Partial<Parameters<typeof QuickAddForm>[0]> = {},
) => {
	const onSubmit = jest.fn(async (_draft: EntryDraft, _currency: string) => {});
	const onOpenFullForm = jest.fn((_draft: Partial<EntryDraft>) => {});
	const Plus = () => {
		const [open, setOpen] = useState(false);
		return open ? (
			<QuickAddForm
				baseCurrency="PKR"
				categories={categories}
				history={history}
				onOpenFullForm={onOpenFullForm}
				onSubmit={onSubmit}
				timeZone="Asia/Karachi"
				today="2026-10-26"
				wallets={wallets}
				{...props}
			/>
		) : (
			<Button onPress={() => setOpen(true)}>New entry</Button>
		);
	};
	await render(<Plus />);
	const user = userEvent.setup();
	let taps = 0;
	const tap = async (
		name: string | RegExp,
		role: "button" | "radio" = "button",
	) => {
		taps += 1;
		await user.press(screen.getByRole(role, { name }));
	};
	return { onSubmit, onOpenFullForm, tap, taps: () => taps };
};

describe("QuickAddForm", () => {
	it("repeats an Entry in 3 taps: ＋ → Recent chip → Save", async () => {
		const { onSubmit, tap, taps } = await setup();
		await tap("New entry");
		await tap("Bread");
		await tap("Save");

		expect(taps()).toBe(3);
		expect(onSubmit).toHaveBeenCalledWith(
			{
				kind: "expense",
				amount: "130",
				walletId: "w2",
				categoryId: "c2",
				occurredOn: "2026-10-26",
				occurredTime: null,
				description: "Bread",
				notes: null,
			},
			"PKR",
		);
	});

	it("records a new Entry in 3 taps plus digits: ＋ → digits → category → Save, into the default Wallet today", async () => {
		const { onSubmit, tap, taps } = await setup();
		await tap("New entry");
		const before = taps();
		for (const digit of ["4", "5", "0"]) await tap(digit);
		const digits = taps() - before;
		await tap("Travel", "radio");
		await tap("Save");

		expect(taps() - digits).toBe(3);
		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				amount: "450",
				walletId: "w1",
				categoryId: "c3",
				occurredOn: "2026-10-26",
				description: null,
			}),
			"PKR",
		);
	});

	it("offers the most frequent recent descriptions first", async () => {
		const { tap } = await setup();
		await tap("New entry");
		const chips = screen.getAllByRole("button", { name: /^(Bread|Bus)$/ });
		expect(chips[0]).toHaveTextContent("Bread");
		expect(chips[1]).toHaveTextContent("Bus");
	});

	it("can't save without an amount and a Category", async () => {
		const { tap } = await setup();
		await tap("New entry");
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		await tap("1");
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		await tap("Travel", "radio");
		expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
	});

	it("shows the amount as typed on the keypad", async () => {
		const { tap } = await setup();
		await tap("New entry");
		for (const key of [
			"1",
			"2",
			"Decimal point",
			"5",
			"Delete last digit",
			"7",
		])
			await tap(key);
		expect(screen.getByLabelText("Amount")).toHaveAccessibilityValue({
			text: formatMoney(parseMoney("12.7", "PKR")),
		});
	});

	it("moves to yesterday and another Wallet through its chips, offering only Base-currency Wallets", async () => {
		const { onSubmit, tap } = await setup();
		await tap("New entry");
		await tap("Date: Today");
		await tap("Yesterday", "radio");
		await tap("Wallet: Cash");
		expect(screen.queryByRole("radio", { name: "Dollars" })).toBeNull();
		await tap("HBL", "radio");
		await tap("7");
		await tap("Travel", "radio");
		await tap("Save");
		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({ occurredOn: "2026-10-25", walletId: "w2" }),
			"PKR",
		);
	});

	it("shows the most used Categories first, and the rest on request", async () => {
		// Groceries (a Subcategory) is used most; ten more top-level Categories overflow the grid.
		const many = [
			...categories,
			...Array.from({ length: 10 }, (_, i) =>
				makeCategory(`x${i}`, `Extra ${i}`),
			),
		];
		const { tap } = await setup({ categories: many });
		await tap("New entry");
		const shown = () =>
			screen.getAllByRole("radio").map((r) => r.props.accessibilityLabel);
		expect(shown().indexOf("Groceries")).toBeLessThan(
			shown().indexOf("Extra 0"),
		);
		expect(shown()).not.toContain("Extra 9");
		await tap("All Categories");
		expect(shown()).toContain("Extra 9");
	});

	it("opens the full form for Items with what's entered so far", async () => {
		const { onOpenFullForm, tap } = await setup();
		await tap("New entry");
		await tap("9");
		await tap("Travel", "radio");
		await tap("Items");
		expect(onOpenFullForm).toHaveBeenCalledWith(
			expect.objectContaining({
				amount: "9",
				categoryId: "c3",
				walletId: "w1",
			}),
		);
	});
});
