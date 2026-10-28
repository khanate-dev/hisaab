import { describe, expect, it, jest } from "@jest/globals";
import type { Appearance } from "@hisaab/client-schema";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import { DeviceSettings } from "./device-settings";
import { LockScreen } from "./lock-screen";

describe("DeviceSettings", () => {
	const setup = async (
		props: Partial<Parameters<typeof DeviceSettings>[0]> = {},
	) => {
		const handlers = {
			onAppearance: jest.fn((_a: Appearance) => {}),
			onLock: jest.fn((_on: boolean) => {}),
		};
		await render(
			<DeviceSettings
				appearance="system"
				lockAvailable
				lockOn={false}
				lockProblem={null}
				{...handlers}
				{...props}
			/>,
		);
		return { ...handlers, user: userEvent.setup() };
	};

	it("follows the device's appearance until told to stay light or dark", async () => {
		const { onAppearance, user } = await setup();
		expect(
			screen.getByRole("radio", { name: "Like the device" }),
		).toBeChecked();
		await user.press(screen.getByRole("radio", { name: "Dark" }));
		expect(onAppearance).toHaveBeenCalledWith("dark");
	});

	it("offers the app lock, off by default, where the device can do it", async () => {
		const { onLock, user } = await setup();
		const lock = screen.getByRole("checkbox", { name: "App lock" });
		expect(lock).not.toBeChecked();
		await user.press(lock);
		expect(onLock).toHaveBeenCalledWith(true);
	});

	it("says why the app lock stayed off", async () => {
		await setup({
			lockProblem: "The unlock didn't pass, so the app lock stays off.",
		});
		expect(screen.getByRole("alert")).toHaveTextContent(/stays off/);
	});

	it("has no app lock where the device can't do it, the web included", async () => {
		await setup({ lockAvailable: false });
		expect(screen.queryByRole("checkbox", { name: "App lock" })).toBeNull();
	});
});

describe("LockScreen", () => {
	it("asks for the unlock as soon as it shows, and again from its button", async () => {
		const onUnlock = jest.fn();
		await render(
			<LockScreen
				failed={false}
				onUnlock={onUnlock}
			/>,
		);
		expect(onUnlock).toHaveBeenCalledTimes(1);
		await userEvent
			.setup()
			.press(screen.getByRole("button", { name: "Unlock" }));
		expect(onUnlock).toHaveBeenCalledTimes(2);
	});

	it("says when the unlock didn't pass", async () => {
		await render(
			<LockScreen
				failed
				onUnlock={() => {}}
			/>,
		);
		expect(screen.getByRole("alert")).toHaveTextContent(/didn't unlock/);
		expect(screen.queryByText("Hisaab is locked")).toBeVisible();
	});
});
