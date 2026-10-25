import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";

import { UpdateRequired } from "./update-required";
import { render } from "@/test/render";

describe("UpdateRequired", () => {
	it("blocks the app with an explanation that nothing is lost, and offers the update", async () => {
		const onUpdate = jest.fn(() => {});
		await render(<UpdateRequired onUpdate={onUpdate} />);

		expect(
			screen.getByRole("heading", { name: /update required/i }),
		).toBeOnTheScreen();
		expect(screen.getByText(/changes are safe/i)).toBeOnTheScreen();
		await userEvent
			.setup()
			.press(screen.getByRole("button", { name: /update/i }));
		expect(onUpdate).toHaveBeenCalled();
	});

	it("explains how to update when the app can't update itself", async () => {
		await render(<UpdateRequired />);
		expect(screen.queryByRole("button")).toBeNull();
		expect(screen.getByText(/app store/i)).toBeOnTheScreen();
	});
});
