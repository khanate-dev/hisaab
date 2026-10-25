import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";

import { Button } from "./button";
import { render } from "@/test/render";

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
