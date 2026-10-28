import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import { type PushState, PushSetting } from "./push-setting";

const setup = async (state: PushState, problem: string | null = null) => {
	const handlers = { onTurnOn: jest.fn(), onTurnOff: jest.fn() };
	await render(
		<PushSetting
			busy={false}
			problem={problem}
			state={state}
			{...handlers}
		/>,
	);
	return { ...handlers, user: userEvent.setup() };
};

describe("PushSetting", () => {
	it("asks for push only when pressed, here in context", async () => {
		const { onTurnOn, user } = await setup("off");
		expect(onTurnOn).not.toHaveBeenCalled();
		await user.press(
			screen.getByRole("button", { name: "Turn on push notifications" }),
		);
		expect(onTurnOn).toHaveBeenCalled();
	});

	it("turns it off again", async () => {
		const { onTurnOff, user } = await setup("on");
		await user.press(
			screen.getByRole("button", { name: "Turn off push notifications" }),
		);
		expect(onTurnOff).toHaveBeenCalled();
	});

	it("says how to allow it once it was blocked", async () => {
		await setup("denied");
		expect(screen.getByText(/blocked for Hisaab here/)).toBeVisible();
		expect(
			screen.getByRole("button", { name: "Turn on push notifications" }),
		).toBeVisible();
	});

	it("offers nothing where push isn't available, the inbox still getting everything", async () => {
		await setup("unavailable");
		expect(screen.queryByRole("button")).toBeNull();
		expect(
			screen.getByText(/inbox still gets every Notification/),
		).toBeVisible();
	});

	it("says when the change didn't go through", async () => {
		await setup(
			"off",
			"That didn't change. Check you're online and try again.",
		);
		expect(screen.getByRole("alert")).toHaveTextContent(/online/);
	});
});
