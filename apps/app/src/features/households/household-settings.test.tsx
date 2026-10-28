import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";

import type { WalletChoice } from "@/features/entries/types";
import { render } from "@/test/render";

import type { HouseholdSettings } from "./actions";
import { HouseholdSettingsForm } from "./household-settings";

const family = {
	id: "h2",
	name: "Family",
	personal_user_id: null,
	base_currency: "PKR",
	timezone: "Asia/Karachi",
	budget_month_start_day: 1,
	created_by: "u1",
	created_at: "2026-10-01T00:00:00.000Z",
	restored_at: null,
	_metadata: null,
	_deleted: null,
};
const wallets: WalletChoice[] = [
	{ id: "w1", name: "Cash", currency: "PKR", archived_at: null },
	{ id: "w2", name: "HBL", currency: "PKR", archived_at: null },
];

const setup = async (
	props: Partial<Parameters<typeof HouseholdSettingsForm>[0]> = {},
) => {
	const onSave = jest.fn(async (_settings: HouseholdSettings) => {});
	const onPick = jest.fn(async (_walletId: string | null) => {});
	await render(
		<HouseholdSettingsForm
			currencyLocked={false}
			defaultWallet={{ wallets, walletId: null, onPick }}
			household={family}
			isAdmin
			isPersonal={false}
			onSave={onSave}
			timeZoneFallback="UTC"
			{...props}
		/>,
	);
	return { onSave, onPick, user: userEvent.setup() };
};

describe("HouseholdSettingsForm", () => {
	it("lets an Admin set the name, Base currency, Budget month start day and timezone", async () => {
		const { onSave, user } = await setup();
		const name = screen.getByLabelText("Name");
		await user.clear(name);
		await user.type(name, "Home");
		const currency = screen.getByLabelText("Base currency");
		await user.clear(currency);
		await user.type(currency, "usd");
		const day = screen.getByLabelText("Budget month starts on");
		await user.clear(day);
		await user.type(day, "25");
		const timeZone = screen.getByLabelText("Timezone");
		await user.clear(timeZone);
		await user.type(timeZone, "Europe/London");
		await user.press(screen.getByRole("button", { name: "Save settings" }));
		expect(onSave).toHaveBeenCalledWith({
			name: "Home",
			baseCurrency: "USD",
			budgetMonthStartDay: 25,
			timeZone: "Europe/London",
		});
		expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
	});

	it("starts Budget months only on days every month has", async () => {
		const { onSave, user } = await setup();
		const day = screen.getByLabelText("Budget month starts on");
		await user.clear(day);
		await user.type(day, "29");
		await user.press(screen.getByRole("button", { name: "Save settings" }));
		expect(screen.getByRole("alert")).toHaveTextContent(/1 to 28/);
		expect(onSave).not.toHaveBeenCalled();
	});

	it("keeps the Base currency fixed once the household has an Entry", async () => {
		await setup({ currencyLocked: true });
		expect(screen.getByLabelText("Base currency")).toBeDisabled();
	});

	it("keeps a Personal household's name", async () => {
		const { onSave, user } = await setup({ isPersonal: true });
		expect(screen.queryByLabelText("Name")).toBeNull();
		await user.press(screen.getByRole("button", { name: "Save settings" }));
		expect(onSave).toHaveBeenCalledWith({
			baseCurrency: "PKR",
			budgetMonthStartDay: 1,
			timeZone: "Asia/Karachi",
		});
	});

	it("shows Members the settings without changing them", async () => {
		await setup({ isAdmin: false });
		expect(screen.queryByRole("button", { name: "Save settings" })).toBeNull();
		expect(screen.getByText(/Budget month starts on day 1/)).toBeOnTheScreen();
	});

	it("lets each Member pick their own default Wallet, or none", async () => {
		const { onPick, user } = await setup({ isAdmin: false });
		await user.press(screen.getByRole("radio", { name: "HBL" }));
		expect(onPick).toHaveBeenCalledWith("w2");
		await user.press(screen.getByRole("radio", { name: "None" }));
		expect(onPick).toHaveBeenLastCalledWith(null);
	});
});
