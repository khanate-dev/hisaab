import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import { NotifyMe } from "./notify-me";

describe("NotifyMe", () => {
	it("turns being told about a rule on and off for someone who didn't make it", async () => {
		const onChange = jest.fn();
		const view = await render(
			<NotifyMe
				isMaker={false}
				on={false}
				onChange={onChange}
			/>,
		);
		const chip = screen.getByRole("checkbox", {
			name: "Notify me about this rule",
		});
		expect(chip).not.toBeChecked();
		await userEvent.setup().press(chip);
		expect(onChange).toHaveBeenCalledWith(true);
		await view.rerender(
			<NotifyMe
				isMaker={false}
				on
				onChange={onChange}
			/>,
		);
		expect(
			screen.getByRole("checkbox", { name: "Notify me about this rule" }),
		).toBeChecked();
	});

	it("tells the maker they're told already, with nothing to turn on", async () => {
		await render(
			<NotifyMe
				isMaker
				on={false}
				onChange={() => {}}
			/>,
		);
		expect(screen.getByText(/You made this rule/)).toBeVisible();
		expect(screen.queryByRole("checkbox")).toBeNull();
	});
});
