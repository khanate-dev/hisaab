import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";

import { makeEntry } from "@/test/entries";
import { render } from "@/test/render";

import { TransferForm } from "./transfer-form";
import type { TransferDraft, WalletChoice } from "./types";

const wallets: WalletChoice[] = [
	{ id: "w1", name: "Cash", currency: "PKR", archived_at: null },
	{ id: "w2", name: "HBL", currency: "PKR", archived_at: null },
	{ id: "w3", name: "Dollars", currency: "USD", archived_at: null },
	{
		id: "w4",
		name: "Old",
		currency: "PKR",
		archived_at: "2026-10-01T00:00:00.000Z",
	},
];

const setup = async (
	props: Partial<Parameters<typeof TransferForm>[0]> = {},
) => {
	const onSubmit = jest.fn(
		async (
			_draft: TransferDraft,
			_currencies: { from: string; to: string },
			_toHouseholdId: string | null,
		) => {},
	);
	await render(
		<TransferForm
			baseCurrency="PKR"
			onSubmit={onSubmit}
			submitLabel="Save Transfer"
			timeZone="Asia/Karachi"
			today="2026-10-26"
			wallets={wallets}
			{...props}
		/>,
	);
	return { onSubmit, user: userEvent.setup() };
};

describe("TransferForm", () => {
	it("moves money from one Wallet to another, arriving with what left", async () => {
		const { onSubmit, user } = await setup();
		await user.type(screen.getByLabelText("Amount (PKR)"), "5000");
		await user.press(screen.getByRole("button", { name: "Save Transfer" }));
		expect(onSubmit).toHaveBeenCalledWith(
			{
				fromWalletId: "w1",
				toWalletId: "w2",
				amount: "5000",
				toAmount: "5000",
				occurredOn: "2026-10-26",
				description: null,
				notes: null,
			},
			{ from: "PKR", to: "PKR" },
			null,
		);
	});

	it("moves money between Base-currency Wallets only, until Transfers between currencies (#45)", async () => {
		await setup();
		expect(screen.queryByRole("radio", { name: "Dollars" })).toBeNull();
	});

	it("never offers the From Wallet, or an archived one, to move money to", async () => {
		await setup();
		const toCash = screen.getAllByRole("radio", { name: "Cash" });
		expect(toCash).toHaveLength(1);
		expect(screen.queryByRole("radio", { name: "Old" })).toBeNull();
	});

	it("refuses an amount that isn't more than zero", async () => {
		const { onSubmit, user } = await setup();
		await user.type(screen.getByLabelText("Amount (PKR)"), "0");
		await user.press(screen.getByRole("button", { name: "Save Transfer" }));
		expect(screen.getByRole("alert")).toHaveTextContent(/more than zero/i);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("edits a Transfer as how much moved", async () => {
		const { onSubmit, user } = await setup({
			entry: makeEntry("e1", {
				kind: "transfer",
				category_id: null,
				wallet_id: "w2",
				to_wallet_id: "w1",
				amount: "-700",
				to_amount: "700",
			}),
		});
		expect(screen.getByLabelText("Amount (PKR)")).toHaveDisplayValue("700");
		await user.press(screen.getByRole("button", { name: "Save Transfer" }));
		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				fromWalletId: "w2",
				toWalletId: "w1",
				amount: "700",
				toAmount: "700",
			}),
			{ from: "PKR", to: "PKR" },
			null,
		);
	});

	it("goes to another of the User's households, grouped under it, in the same currency", async () => {
		const { onSubmit, user } = await setup({
			otherHouseholds: [
				{
					householdId: "h2",
					name: "Family",
					isPersonal: false,
					wallets: [
						{ id: "f1", name: "Joint", currency: "PKR", archived_at: null },
						{ id: "f2", name: "Travel", currency: "USD", archived_at: null },
					],
				},
			],
		});
		expect(screen.getByLabelText("To a Wallet in Family")).toBeOnTheScreen();
		expect(screen.queryByRole("radio", { name: "Travel" })).toBeNull();
		await user.press(screen.getByRole("radio", { name: "Joint" }));
		await user.type(screen.getByLabelText("Amount (PKR)"), "2500");
		await user.press(screen.getByRole("button", { name: "Save Transfer" }));
		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				fromWalletId: "w1",
				toWalletId: "f1",
				amount: "2500",
			}),
			{ from: "PKR", to: "PKR" },
			"h2",
		);
	});
});
