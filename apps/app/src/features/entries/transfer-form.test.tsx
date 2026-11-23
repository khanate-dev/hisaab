import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent, within } from "@testing-library/react-native";

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

	describe("between currencies", () => {
		const rates = [
			{ on_date: "2026-10-26", currency: "USD", per_usd: "1" },
			{ on_date: "2026-10-26", currency: "PKR", per_usd: "280" },
		];

		it("pre-fills what arrives at the day's rate, following the amount, and stores both real amounts", async () => {
			const { onSubmit, user } = await setup({ rates });
			await user.press(
				within(screen.getByLabelText("To Wallet")).getByRole("radio", {
					name: "Dollars (USD)",
				}),
			);
			await user.type(screen.getByLabelText("Amount (PKR)"), "28000");
			expect(screen.getByLabelText("Received (USD)")).toHaveDisplayValue("100");
			await user.clear(screen.getByLabelText("Received (USD)"));
			await user.type(screen.getByLabelText("Received (USD)"), "98.50");
			await user.press(screen.getByRole("button", { name: "Save Transfer" }));
			expect(onSubmit).toHaveBeenCalledWith(
				expect.objectContaining({
					fromWalletId: "w1",
					toWalletId: "w3",
					amount: "28000",
					toAmount: "98.50",
				}),
				{ from: "PKR", to: "USD" },
				null,
			);
		});

		it("asks for what arrived when no rate is held, within the To Wallet's decimals", async () => {
			const { onSubmit, user } = await setup({ rates: [] });
			await user.press(
				within(screen.getByLabelText("To Wallet")).getByRole("radio", {
					name: "Dollars (USD)",
				}),
			);
			await user.type(screen.getByLabelText("Amount (PKR)"), "28000");
			expect(screen.getByLabelText("Received (USD)")).toHaveDisplayValue("");
			await user.press(screen.getByRole("button", { name: "Save Transfer" }));
			expect(screen.getByRole("alert")).toHaveTextContent(/what arrived/i);
			await user.type(screen.getByLabelText("Received (USD)"), "99.999");
			await user.press(screen.getByRole("button", { name: "Save Transfer" }));
			expect(screen.getByRole("alert")).toHaveTextContent(
				"USD has at most 2 decimals.",
			);
			expect(onSubmit).not.toHaveBeenCalled();
		});

		it("edits a Transfer between currencies with what arrived as saved", async () => {
			await setup({
				rates,
				entry: makeEntry("e1", {
					kind: "transfer",
					category_id: null,
					wallet_id: "w1",
					to_wallet_id: "w3",
					amount: "-28000",
					to_amount: "99",
				}),
			});
			expect(screen.getByLabelText("Received (USD)")).toHaveDisplayValue("99");
		});

		it("keeps what arrived when saved untouched, and prices it again when the amount changes", async () => {
			const { onSubmit, user } = await setup({
				rates,
				entry: makeEntry("e1", {
					kind: "transfer",
					category_id: null,
					wallet_id: "w1",
					to_wallet_id: "w3",
					amount: "-28000",
					to_amount: "99",
				}),
			});
			await user.press(screen.getByRole("button", { name: "Save Transfer" }));
			expect(onSubmit).toHaveBeenLastCalledWith(
				expect.objectContaining({ amount: "28000", toAmount: "99" }),
				{ from: "PKR", to: "USD" },
				null,
			);
			await user.clear(screen.getByLabelText("Amount (PKR)"));
			await user.type(screen.getByLabelText("Amount (PKR)"), "2800");
			expect(screen.getByLabelText("Received (USD)")).toHaveDisplayValue("10");
		});

		it("drops a typed Received amount for another To Wallet, and arrives with what left in the same currency", async () => {
			const { onSubmit, user } = await setup({ rates });
			const toWallet = (name: string) =>
				within(screen.getByLabelText("To Wallet")).getByRole("radio", { name });
			await user.press(toWallet("Dollars (USD)"));
			await user.type(screen.getByLabelText("Amount (PKR)"), "28000");
			await user.clear(screen.getByLabelText("Received (USD)"));
			await user.type(screen.getByLabelText("Received (USD)"), "90");
			await user.press(toWallet("HBL"));
			expect(screen.queryByLabelText("Received (USD)")).toBeNull();
			await user.press(screen.getByRole("button", { name: "Save Transfer" }));
			expect(onSubmit).toHaveBeenLastCalledWith(
				expect.objectContaining({
					toWalletId: "w2",
					amount: "28000",
					toAmount: "28000",
				}),
				{ from: "PKR", to: "PKR" },
				null,
			);
		});
	});

	it("keeps the amount to its Wallet's currency's decimals", async () => {
		const { onSubmit, user } = await setup();
		await user.type(screen.getByLabelText("Amount (PKR)"), "10.555");
		await user.press(screen.getByRole("button", { name: "Save Transfer" }));
		expect(screen.getByRole("alert")).toHaveTextContent(
			"PKR has at most 2 decimals.",
		);
		expect(onSubmit).not.toHaveBeenCalled();
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

	it("goes to another of the User's households, grouped under it", async () => {
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

	it("goes to another household's Wallet in another currency, each half in its own", async () => {
		const { onSubmit, user } = await setup({
			rates: [
				{ on_date: "2026-10-26", currency: "USD", per_usd: "1" },
				{ on_date: "2026-10-26", currency: "PKR", per_usd: "280" },
			],
			otherHouseholds: [
				{
					householdId: "h2",
					name: "Family",
					isPersonal: false,
					wallets: [
						{ id: "f2", name: "Travel", currency: "USD", archived_at: null },
					],
				},
			],
		});
		await user.press(screen.getByRole("radio", { name: "Travel (USD)" }));
		await user.type(screen.getByLabelText("Amount (PKR)"), "2800");
		await user.press(screen.getByRole("button", { name: "Save Transfer" }));
		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({ amount: "2800", toAmount: "10" }),
			{ from: "PKR", to: "USD" },
			"h2",
		);
	});
});
