import { describe, expect, it, jest } from "@jest/globals";
import { type Money, moneyEquals, parseMoney } from "@hisaab/domain";
import { PortalHost } from "@rn-primitives/portal";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import { AdjustBalance } from "./adjust-balance";

const setup = async () => {
	const onAdjust = jest.fn(async (_gap: Money) => {});
	await render(
		<>
			<AdjustBalance
				balance={parseMoney("1000", "PKR")}
				onAdjust={onAdjust}
			/>
			<PortalHost />
		</>,
	);
	return { onAdjust, user: userEvent.setup() };
};

describe("AdjustBalance", () => {
	it("records the gap between the Balance and what the Wallet really holds", async () => {
		const { onAdjust, user } = await setup();
		await user.press(screen.getByRole("button", { name: "Adjust balance" }));
		await user.type(
			await screen.findByLabelText("Actual balance (PKR)"),
			"750",
		);
		expect(screen.getByRole("status")).toHaveTextContent(/adjustment of/i);
		await user.press(screen.getByRole("button", { name: "Save adjustment" }));
		expect(onAdjust).toHaveBeenCalledTimes(1);
		const [gap] = onAdjust.mock.calls[0] ?? [];
		expect(gap && moneyEquals(gap, parseMoney("-250", "PKR"))).toBe(true);
	});

	it("records nothing when the Balance is already right", async () => {
		const { onAdjust, user } = await setup();
		await user.press(screen.getByRole("button", { name: "Adjust balance" }));
		await user.type(
			await screen.findByLabelText("Actual balance (PKR)"),
			"1000",
		);
		await user.press(screen.getByRole("button", { name: "Save adjustment" }));
		expect(screen.getByRole("alert")).toHaveTextContent(/nothing to adjust/i);
		expect(onAdjust).not.toHaveBeenCalled();
	});
});
