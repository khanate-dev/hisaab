import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import { FirstWalletForm } from "./first-wallet-form";

const setup = async (defaultCurrency = "PKR") => {
	const onSubmit = jest.fn(
		async (_wallet: { opening: string; currency: string }) => {},
	);
	await render(
		<FirstWalletForm
			defaultCurrency={defaultCurrency}
			onSubmit={onSubmit}
		/>,
	);
	return { onSubmit, user: userEvent.setup() };
};

describe("FirstWalletForm", () => {
	it("creates Cash with the opening balance in the device's currency", async () => {
		const { onSubmit, user } = await setup();

		expect(screen.getByLabelText("Currency")).toHaveDisplayValue("PKR");
		await user.type(screen.getByLabelText("Cash in hand"), "1500.50");
		await user.press(
			screen.getByRole("button", { name: "Create Cash wallet" }),
		);
		expect(onSubmit).toHaveBeenCalledWith({
			opening: "1500.50",
			currency: "PKR",
		});
	});

	it("takes another currency, upper-cased", async () => {
		const { onSubmit, user } = await setup();

		await user.clear(screen.getByLabelText("Currency"));
		await user.type(screen.getByLabelText("Currency"), "aed");
		await user.type(screen.getByLabelText("Cash in hand"), "20");
		await user.press(
			screen.getByRole("button", { name: "Create Cash wallet" }),
		);
		expect(onSubmit).toHaveBeenCalledWith({ opening: "20", currency: "AED" });
	});

	it("explains a malformed amount instead of saving it", async () => {
		const { onSubmit, user } = await setup();

		await user.type(screen.getByLabelText("Cash in hand"), "12.3.4");
		await user.press(
			screen.getByRole("button", { name: "Create Cash wallet" }),
		);
		expect(screen.getByRole("alert")).toHaveTextContent(/amount/i);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("explains a currency that isn't a currency code", async () => {
		const { onSubmit, user } = await setup();

		await user.clear(screen.getByLabelText("Currency"));
		await user.type(screen.getByLabelText("Currency"), "RUPEES");
		await user.press(screen.getByRole("button", { name: "Skip" }));
		expect(screen.getByRole("alert")).toHaveTextContent(/currency/i);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("starts Cash at 0 when skipped", async () => {
		const { onSubmit, user } = await setup();

		await user.press(screen.getByRole("button", { name: "Skip" }));
		expect(onSubmit).toHaveBeenCalledWith({ opening: "0", currency: "PKR" });
	});

	it("says the Base currency locks after the first Entry", async () => {
		await setup();
		expect(screen.getByText(/locks after your first entry/i)).toBeOnTheScreen();
	});
});
