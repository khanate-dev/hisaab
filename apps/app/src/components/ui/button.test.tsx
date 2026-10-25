import { describe, expect, it, jest } from "@jest/globals";
import { render, screen, userEvent } from "@testing-library/react-native";

import { Button } from "./button";
import { Card } from "./card";

describe("Button", () => {
	it("runs its action when pressed", async () => {
		const onPress = jest.fn(() => {});
		await render(<Button onPress={onPress}>Save</Button>);
		await userEvent.setup().press(screen.getByRole("button", { name: "Save" }));
		expect(onPress).toHaveBeenCalledTimes(1);
	});

	it("does nothing and says so when disabled", async () => {
		const onPress = jest.fn(() => {});
		await render(
			<Button
				disabled
				onPress={onPress}
			>
				Save
			</Button>,
		);
		const button = screen.getByRole("button", { name: "Save" });
		expect(button).toBeDisabled();
		await userEvent.setup().press(button);
		expect(onPress).not.toHaveBeenCalled();
	});
});

describe("Card", () => {
	it("is a plain container unless it has an action", async () => {
		await render(<Card>Balance</Card>);
		expect(screen.queryByRole("button")).toBeNull();
		expect(screen.getByText("Balance")).toBeOnTheScreen();
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
