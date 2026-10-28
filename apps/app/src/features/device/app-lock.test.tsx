import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, screen, userEvent, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

import { Text } from "@/components/ui/text";
import { render } from "@/test/render";

import { AppLock } from "./app-lock";

const mockDevice = {
	settings: { appearance: "system", appLock: true } as
		{ appearance: string; appLock: boolean } | undefined,
	can: true,
	passes: true,
};
const mockUnlock = jest.fn(async (_prompt: string) => mockDevice.passes);
jest.mock("@/lib/device/settings", () => ({
	useDeviceSettings: () => mockDevice.settings,
}));
jest.mock("@/lib/device/biometrics", () => ({
	canLockWithBiometrics: async () => mockDevice.can,
	unlockWithBiometrics: (prompt: string) => mockUnlock(prompt),
}));

let changeApp: (state: AppStateStatus) => void = () => {};
beforeEach(() => {
	mockDevice.settings = { appearance: "system", appLock: true };
	mockDevice.can = true;
	mockDevice.passes = true;
	mockUnlock.mockClear();
	jest
		.spyOn(AppState, "addEventListener")
		.mockImplementation((_type, handler) => {
			changeApp = handler as (state: AppStateStatus) => void;
			return { remove: () => {} } as ReturnType<
				typeof AppState.addEventListener
			>;
		});
});

const app = () => (
	<AppLock>
		<Text>Draft Entry</Text>
	</AppLock>
);

describe("AppLock", () => {
	it("opens locked, asks for the unlock, and lifts off the app as it was", async () => {
		mockDevice.passes = false;
		await render(app());
		expect(screen.getByText("Hisaab is locked")).toBeVisible();
		await waitFor(() => expect(mockUnlock).toHaveBeenCalledTimes(1));
		expect(screen.getByRole("alert")).toHaveTextContent(/didn't unlock/);
		mockDevice.passes = true;
		await userEvent
			.setup()
			.press(screen.getByRole("button", { name: "Unlock" }));
		await waitFor(() =>
			expect(screen.queryByText("Hisaab is locked")).toBeNull(),
		);
		expect(screen.getByText("Draft Entry")).toBeVisible();
	});

	it("locks again when the app goes to the background, and covers it in the app switcher", async () => {
		await render(app());
		await waitFor(() =>
			expect(screen.queryByText("Hisaab is locked")).toBeNull(),
		);
		// Stays locked to be seen: the unlock it asks for doesn't pass.
		mockDevice.passes = false;
		await act(async () => changeApp("inactive"));
		expect(screen.queryByText("Hisaab is locked")).toBeNull();
		await act(async () => changeApp("background"));
		expect(screen.getByText("Hisaab is locked")).toBeVisible();
		await waitFor(() => expect(mockUnlock).toHaveBeenCalledTimes(2));
	});

	it("doesn't lock when the lock is off, nor the moment it's turned on", async () => {
		mockDevice.settings = { appearance: "system", appLock: false };
		const { rerender } = await render(app());
		mockDevice.settings = { appearance: "system", appLock: true };
		await rerender(app());
		expect(screen.queryByText("Hisaab is locked")).toBeNull();
		expect(mockUnlock).not.toHaveBeenCalled();
	});

	it("never holds a mockDevice that can no longer unlock", async () => {
		mockDevice.can = false;
		mockDevice.passes = false;
		await render(app());
		await waitFor(() =>
			expect(screen.queryByText("Hisaab is locked")).toBeNull(),
		);
		expect(screen.getByText("Draft Entry")).toBeVisible();
	});
});
