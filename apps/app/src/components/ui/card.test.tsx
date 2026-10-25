import { describe, expect, it, jest } from "@jest/globals";
import { render, screen, userEvent } from "@testing-library/react-native";

import { Card } from "./card";

describe("Card", () => {
	it("is a plain container unless it has an action", async () => {
		await render(
			<Card
				accessible
				role="summary"
			>
				Balance
			</Card>,
		);
		expect(screen.queryByRole("button")).toBeNull();
		expect(screen.getByRole("summary")).toHaveTextContent("Balance");
	});

	it("is a button when it has an action", async () => {
		const onPress = jest.fn(() => {});
		await render(
			<Card
				accessibilityLabel="Cash wallet"
				onPress={onPress}
			>
				Cash
			</Card>,
		);
		await userEvent
			.setup()
			.press(screen.getByRole("button", { name: "Cash wallet" }));
		expect(onPress).toHaveBeenCalled();
	});
});
