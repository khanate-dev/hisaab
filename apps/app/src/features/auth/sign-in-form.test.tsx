import { describe, expect, it, jest } from "@jest/globals";
import { render, screen, userEvent } from "@testing-library/react-native";

import { SignInForm } from "./sign-in-form";

const setup = async (
	overrides: Partial<Parameters<typeof SignInForm>[0]> = {},
) => {
	const props = {
		sendCode: jest.fn(async (_email: string) => {}),
		verifyCode: jest.fn(async (_email: string, _code: string) => {}),
		...overrides,
	};
	await render(<SignInForm {...props} />);
	return { ...props, user: userEvent.setup() };
};

describe("SignInForm", () => {
	it("emails a code, then signs in with it", async () => {
		const { user, sendCode, verifyCode } = await setup();

		await user.type(screen.getByLabelText("Email"), "alice@example.com");
		await user.press(screen.getByRole("button", { name: /send code/i }));
		expect(sendCode).toHaveBeenCalledWith("alice@example.com");

		await user.type(await screen.findByLabelText("Code"), "123456");
		await user.press(screen.getByRole("button", { name: /sign in/i }));
		expect(verifyCode).toHaveBeenCalledWith("alice@example.com", "123456");
	});

	it("says why the code could not be sent", async () => {
		const { user } = await setup({
			sendCode: jest.fn(async () => {
				throw new Error("Email rate limit exceeded");
			}),
		});

		await user.type(screen.getByLabelText("Email"), "alice@example.com");
		await user.press(screen.getByRole("button", { name: /send code/i }));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Email rate limit exceeded",
		);
		expect(screen.queryByLabelText("Code")).toBeNull();
	});

	it("says when the code is wrong and lets the User retry", async () => {
		const verifyCode = jest
			.fn(async (_email: string, _code: string) => {})
			.mockRejectedValueOnce(new Error("Token has expired or is invalid"));
		const { user } = await setup({ verifyCode });

		await user.type(screen.getByLabelText("Email"), "alice@example.com");
		await user.press(screen.getByRole("button", { name: /send code/i }));
		await user.type(await screen.findByLabelText("Code"), "000000");
		await user.press(screen.getByRole("button", { name: /sign in/i }));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Token has expired or is invalid",
		);
		await user.clear(screen.getByLabelText("Code"));
		await user.type(screen.getByLabelText("Code"), "123456");
		await user.press(screen.getByRole("button", { name: /sign in/i }));
		expect(verifyCode).toHaveBeenLastCalledWith("alice@example.com", "123456");
	});
});
