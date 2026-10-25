import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import { NameForm } from "./name-form";

describe("NameForm", () => {
	it("asks for the User's name before continuing", async () => {
		const onSubmit = jest.fn(async (_name: string) => {});
		await render(<NameForm onSubmit={onSubmit} />);
		const user = userEvent.setup();

		expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
		await user.type(screen.getByLabelText("Your name"), "  Ayesha  ");
		await user.press(screen.getByRole("button", { name: "Continue" }));
		expect(onSubmit).toHaveBeenCalledWith("Ayesha");
	});
});
