import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";

import { makeCategory } from "@/test/categories";
import { makeEntry } from "@/test/entries";
import { render } from "@/test/render";

import { EntryForm } from "./entry-form";
import type { EntryDraft, WalletChoice } from "./types";

const wallets: WalletChoice[] = [
	{ id: "w1", name: "Cash", currency: "PKR", archived_at: null },
	{ id: "w2", name: "HBL", currency: "PKR", archived_at: null },
	{
		id: "w3",
		name: "Old card",
		currency: "PKR",
		archived_at: "2026-10-01T00:00:00.000Z",
	},
];
const categories = [
	makeCategory("c1", "Food"),
	makeCategory("c2", "Groceries", { parent_id: "c1" }),
	makeCategory("c3", "Travel"),
	makeCategory("c4", "Salary", { kind: "income" }),
];

const setup = async (props: Partial<Parameters<typeof EntryForm>[0]> = {}) => {
	const onSubmit = jest.fn(async (_draft: EntryDraft, _currency: string) => {});
	await render(
		<EntryForm
			categories={categories}
			history={[]}
			onSubmit={onSubmit}
			baseCurrency="PKR"
			submitLabel="Save Entry"
			timeZone="Asia/Karachi"
			today="2026-10-26"
			wallets={wallets}
			{...props}
		/>,
	);
	return { onSubmit, user: userEvent.setup() };
};

describe("EntryForm", () => {
	it("records an Expense, dated today in the household's timezone unless changed", async () => {
		const { onSubmit, user } = await setup();
		await user.type(screen.getByLabelText("Amount (PKR)"), "450.50");
		await user.press(screen.getByRole("radio", { name: "Food › Groceries" }));
		await user.type(screen.getByLabelText("Description"), "Weekly shop");
		await user.press(screen.getByRole("button", { name: "Save Entry" }));

		expect(onSubmit).toHaveBeenCalledWith(
			{
				kind: "expense",
				amount: "450.50",
				walletId: "w1",
				categoryId: "c2",
				occurredOn: "2026-10-26",
				occurredTime: null,
				description: "Weekly shop",
				notes: null,
			},
			"PKR",
		);
	});

	it("records an Income into another Wallet, with a time and notes", async () => {
		const { onSubmit, user } = await setup();
		await user.press(screen.getByRole("radio", { name: "Income" }));
		await user.type(screen.getByLabelText("Amount (PKR)"), "90000");
		await user.press(screen.getByRole("radio", { name: "HBL" }));
		await user.press(screen.getByRole("radio", { name: "Salary" }));
		await user.type(screen.getByLabelText("Time"), "09:15");
		await user.type(screen.getByLabelText("Notes"), "October");
		await user.press(screen.getByRole("button", { name: "Save Entry" }));

		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "income",
				walletId: "w2",
				categoryId: "c4",
				occurredTime: "09:15",
				notes: "October",
			}),
			"PKR",
		);
	});

	it("offers only the chosen kind's Categories and only active Wallets", async () => {
		await setup();
		expect(screen.queryByRole("radio", { name: "Salary" })).toBeNull();
		expect(screen.queryByRole("radio", { name: "Old card" })).toBeNull();
		expect(screen.getByRole("radio", { name: "Travel" })).toBeOnTheScreen();
	});

	it.each([
		["", "an amount", /amount like/i],
		["0", "a zero amount", /more than zero/i],
		["-5", "a negative amount", /more than zero/i],
	])("refuses %j (%s)", async (typed, _what, message) => {
		const { onSubmit, user } = await setup();
		if (typed) await user.type(screen.getByLabelText("Amount (PKR)"), typed);
		await user.press(screen.getByRole("radio", { name: "Travel" }));
		await user.press(screen.getByRole("button", { name: "Save Entry" }));
		expect(screen.getByRole("alert")).toHaveTextContent(message);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("asks for a Category, a real date and an HH:MM time", async () => {
		const { onSubmit, user } = await setup();
		await user.type(screen.getByLabelText("Amount (PKR)"), "10");
		await user.press(screen.getByRole("button", { name: "Save Entry" }));
		expect(screen.getByRole("alert")).toHaveTextContent(/pick a category/i);

		await user.press(screen.getByRole("radio", { name: "Travel" }));
		await user.clear(screen.getByLabelText("Date"));
		await user.type(screen.getByLabelText("Date"), "2026-02-30");
		await user.press(screen.getByRole("button", { name: "Save Entry" }));
		expect(screen.getByRole("alert")).toHaveTextContent(/YYYY-MM-DD/);

		await user.clear(screen.getByLabelText("Date"));
		await user.type(screen.getByLabelText("Date"), "2026-10-25");
		await user.type(screen.getByLabelText("Time"), "7pm");
		await user.press(screen.getByRole("button", { name: "Save Entry" }));
		expect(screen.getByRole("alert")).toHaveTextContent(/HH:MM/);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("suggests earlier descriptions and fills in their Category, Wallet and amount", async () => {
		const { onSubmit, user } = await setup({
			history: [
				makeEntry("e1", {
					description: "Bread",
					wallet_id: "w2",
					amount: "-120",
					category_id: "c2",
				}),
			],
		});
		await user.type(screen.getByLabelText("Description"), "br");
		await user.press(screen.getByRole("button", { name: "Bread" }));
		expect(screen.queryByRole("button", { name: "Bread" })).toBeNull();
		await user.press(screen.getByRole("button", { name: "Save Entry" }));

		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				description: "Bread",
				walletId: "w2",
				categoryId: "c2",
				amount: "120",
			}),
			"PKR",
		);
	});

	it("edits an Entry as how much it was, keeping its kind", async () => {
		const { onSubmit, user } = await setup({
			entry: makeEntry("e1", { amount: "-450", description: "Shop" }),
		});
		expect(screen.queryByRole("radio", { name: "Income" })).toBeNull();
		expect(screen.getByLabelText("Amount (PKR)")).toHaveDisplayValue("450");
		expect(
			screen.getByRole("radio", { name: "Food › Groceries" }),
		).toBeChecked();
		await user.press(screen.getByRole("button", { name: "Save Entry" }));
		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "expense",
				amount: "450",
				occurredOn: "2026-10-20",
			}),
			"PKR",
		);
	});
});
