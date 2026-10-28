import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

import {
	canLockWithBiometrics,
	unlockWithBiometrics,
} from "@/lib/device/biometrics";
import { updateDeviceSettings, useDeviceSettings } from "@/lib/device/settings";

import { DeviceSettings } from "./device-settings";

/** This device's settings, kept on the device only: they never sync, and stay when someone signs out. */
export const ThisDevice = () => {
	const { t } = useLingui();
	const settings = useDeviceSettings();
	const [lockAvailable, setLockAvailable] = useState(false);
	const [lockProblem, setLockProblem] = useState<string | null>(null);

	useEffect(() => {
		void canLockWithBiometrics().then(setLockAvailable, () =>
			setLockAvailable(false),
		);
	}, []);

	if (settings === undefined) return null;
	const stayedOff = t`The unlock didn't pass, so the app lock stays off.`;
	return (
		<DeviceSettings
			appearance={settings.appearance}
			lockAvailable={lockAvailable}
			lockOn={settings.appLock}
			lockProblem={lockProblem}
			onAppearance={(appearance) => void updateDeviceSettings({ appearance })}
			onLock={(on) => {
				setLockProblem(null);
				// Turning it on proves the unlock works first, so nobody locks themselves out.
				if (!on) return void updateDeviceSettings({ appLock: false });
				void unlockWithBiometrics(t`Turn on the app lock`).then(
					(passed) =>
						passed
							? updateDeviceSettings({ appLock: true })
							: setLockProblem(stayedOff),
					() => setLockProblem(stayedOff),
				);
			}}
		/>
	);
};
