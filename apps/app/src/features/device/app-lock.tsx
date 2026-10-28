import { useLingui } from "@lingui/react/macro";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

import { useDeviceState } from "@/lib/device-state";
import { unlockWithBiometrics } from "@/lib/device/biometrics";

import { LockScreen } from "./lock-screen";

/**
 * The optional app lock (spec §5): when this device has it on, the app opens locked and locks again whenever it goes
 * to the background, until a biometric unlock passes. Off by default; never on the web.
 */
export const AppLock = ({ children }: { children: ReactNode }) => {
	const { t } = useLingui();
	const device = useDeviceState();
	const on = device?.app_lock === true;
	const [locked, setLocked] = useState(true);
	const [failed, setFailed] = useState(false);
	const [lockCount, setLockCount] = useState(0);

	const unlock = useCallback(async () => {
		const passed = await unlockWithBiometrics(t`Unlock Hisaab`).catch(
			() => false,
		);
		setFailed(!passed);
		if (passed) setLocked(false);
	}, [t]);

	useEffect(() => {
		if (!on) return;
		const subscription = AppState.addEventListener("change", (state) => {
			if (state === "background") {
				setLocked(true);
				setFailed(false);
				setLockCount((n) => n + 1);
			}
		});
		return () => subscription.remove();
	}, [on]);

	// Nothing shows until this device's setting is read, so a locked app never flashes its content.
	if (device === undefined) return null;
	if (on && locked)
		return (
			<LockScreen
				failed={failed}
				onUnlock={() => void unlock()}
				// A new screen each time it locks, so each lock asks once.
				key={lockCount}
			/>
		);
	return children;
};
