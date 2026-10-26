import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import type { HouseholdDraft } from "./actions";
import { HouseholdForm } from "./household-form";

const setup = async () => {
	const onSubmit = jest.fn(async (_draft: HouseholdDraft) => {});
	await render(
		<HouseholdForm
			defaultCurrency="PKR"
			defaultTimeZone="Asia/Karachi"
			onSubmit={onSubmit}
		/>,
	);
	return { onSubmit, user: userEvent.setup() };
};

describe("HouseholdForm", () => {
	it("creates a household in the device's currency and timezone", async () => {
		const { onSubmit, user } = await setup();
		await user.type(screen.getByLabelText("Name"), " Family ");
		await user.press(screen.getByRole("button", { name: "Create household" }));
		expect(onSubmit).toHaveBeenCalledWith({
			name: "Family",
			baseCurrency: "PKR",
			timeZone: "Asia/Karachi",
		});
	});

	it("asks for a real currency and timezone", async () => {
		const { onSubmit, user } = await setup();
		await user.type(screen.getByLabelText("Name"), "Family");
		const currency = screen.getByLabelText("Base currency");
		await user.clear(currency);
		await user.type(currency, "XX");
		await user.press(screen.getByRole("button", { name: "Create household" }));
		expect(screen.getByRole("alert")).toHaveTextContent(/currency code/i);
		await user.clear(currency);
		await user.type(currency, "gbp");
		const timeZone = screen.getByLabelText("Timezone");
		await user.clear(timeZone);
		await user.type(timeZone, "Mars/Olympus");
		await user.press(screen.getByRole("button", { name: "Create household" }));
		expect(screen.getByRole("alert")).toHaveTextContent(/timezone/i);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("needs a name", async () => {
		await setup();
		expect(
			screen.getByRole("button", { name: "Create household" }),
		).toBeDisabled();
	});
});
