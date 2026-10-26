import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";

import { Chip } from "./chip";
import { render } from "@/test/render";

describe("Chip", () => {
	it("is a button named by its text", async () => {
		const onPress = jest.fn();
		await render(<Chip onPress={onPress}>Yesterday</Chip>);
		await userEvent.press(screen.getByRole("button", { name: "Yesterday" }));
		expect(onPress).toHaveBeenCalled();
	});
});
