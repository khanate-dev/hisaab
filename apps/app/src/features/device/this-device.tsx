import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

import { updateDeviceState, useDeviceState } from "@/lib/device-state";
import {
	canLockWithBiometrics,
	unlockWithBiometrics,
} from "@/lib/device/biometrics";

import { appearanceOf } from "@hisaab/client-schema";
import { DeviceSettings } from "./device-settings";

/** This device's settings, saved on the device only (they never sync). */
export const ThisDevice = () => {
	const { t } = useLingui();
	const device = useDeviceState();
	const [lockAvailable, setLockAvailable] = useState(false);
	const [lockProblem, setLockProblem] = useState<string | null>(null);

	useEffect(() => {
		void canLockWithBiometrics().then(setLockAvailable, () =>
			setLockAvailable(false),
		);
	}, []);

	if (device === undefined) return null;
	return (
		<DeviceSettings
			appearance={appearanceOf(device.appearance)}
			lockAvailable={lockAvailable}
			lockOn={device.app_lock === true}
			lockProblem={lockProblem}
			onAppearance={(appearance) => void updateDeviceState({ appearance })}
			onLock={(on) => {
				setLockProblem(null);
				// Turning it on proves the unlock works first, so nobody locks themselves out.
				if (!on) return void updateDeviceState({ app_lock: false });
				void unlockWithBiometrics(t`Turn on the app lock`).then(
					(passed) =>
						passed
							? updateDeviceState({ app_lock: true })
							: setLockProblem(
									t`The unlock didn't pass, so the app lock stays off.`,
								),
					() =>
						setLockProblem(
							t`The unlock didn't pass, so the app lock stays off.`,
						),
				);
			}}
		/>
	);
};
