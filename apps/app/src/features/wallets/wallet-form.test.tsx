import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import { type WalletDraft, WalletForm } from "./wallet-form";

const setup = async (props: Partial<Parameters<typeof WalletForm>[0]> = {}) => {
	const onSubmit = jest.fn(async (_wallet: WalletDraft) => {});
	await render(
		<WalletForm
			baseCurrency="PKR"
			onSubmit={onSubmit}
			submitLabel="Add Wallet"
			{...props}
		/>,
	);
	return { onSubmit, user: userEvent.setup() };
};

describe("WalletForm", () => {
	it("adds a Wallet of the chosen type in the Base currency", async () => {
		const { onSubmit, user } = await setup();

		await user.type(screen.getByLabelText("Name"), "HBL");
		await user.press(screen.getByRole("radio", { name: "Bank" }));
		expect(screen.getByRole("radio", { name: "Bank" })).toBeChecked();
		await user.press(screen.getByRole("button", { name: "Add Wallet" }));
		expect(onSubmit).toHaveBeenCalledWith({
			name: "HBL",
			type: "bank",
			currency: "PKR",
		});
	});

	it("needs a name", async () => {
		await setup();
		expect(screen.getByRole("button", { name: "Add Wallet" })).toBeDisabled();
	});

	it("rejects a currency that isn't a currency code", async () => {
		const { onSubmit, user } = await setup();

		await user.type(screen.getByLabelText("Name"), "Card");
		await user.clear(screen.getByLabelText("Currency"));
		await user.type(screen.getByLabelText("Currency"), "XX");
		await user.press(screen.getByRole("button", { name: "Add Wallet" }));
		expect(screen.getByRole("alert")).toHaveTextContent(/currency/i);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("keeps the currency fixed once the Wallet has Entries", async () => {
		await setup({
			initial: { name: "Cash", type: "cash", currency: "PKR" },
			currencyLocked: true,
		});
		expect(screen.getByLabelText("Currency")).toBeDisabled();
		expect(screen.getByHintText(/fixed once/i)).toBe(
			screen.getByLabelText("Currency"),
		);
	});
});
