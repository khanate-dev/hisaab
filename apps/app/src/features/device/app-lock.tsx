import { useLingui } from "@lingui/react/macro";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { AppState, Platform, View } from "react-native";

import {
	canLockWithBiometrics,
	unlockWithBiometrics,
} from "@/lib/device/biometrics";
import { useDeviceSettings } from "@/lib/device/settings";

import { LockScreen } from "./lock-screen";

/**
 * The optional app lock (spec §5). With it on, the app opens locked and locks again whenever it goes to the
 * background, until an unlock passes; while it's in the app switcher a plain cover hides its content. The lock lies
 * over the app, so navigation and half-filled forms are where they were. It never holds a device that can no longer
 * unlock (biometrics and passcode since removed). Off by default; never on the web.
 */
export const AppLock = ({ children }: { children: ReactNode }) => {
	const { t } = useLingui();
	const settings = useDeviceSettings();
	const on = settings?.appLock === true;
	const [started, setStarted] = useState(false);
	const [locked, setLocked] = useState(false);
	const [covered, setCovered] = useState(false);
	const [failed, setFailed] = useState(false);
	const [lockCount, setLockCount] = useState(0);
	const unlocking = useRef(false);

	// Decided once, as the settings arrive at a cold start; turning the lock on later doesn't lock.
	if (settings !== undefined && !started) {
		setStarted(true);
		if (settings.appLock) setLocked(true);
	}

	// A device that can no longer unlock is never held.
	useEffect(() => {
		if (!locked) return;
		void canLockWithBiometrics()
			.catch(() => false)
			.then((can) => {
				if (!can) setLocked(false);
			});
	}, [locked]);

	useEffect(() => {
		if (!on) return;
		const subscription = AppState.addEventListener("change", (state) => {
			// The system's own unlock sheet can send the app to the background; that isn't leaving it.
			if (unlocking.current) return;
			setCovered(state !== "active");
			if (state === "background") {
				setFailed(false);
				setLocked(true);
				setLockCount((n) => n + 1);
			}
		});
		return () => subscription.remove();
	}, [on]);

	const unlock = useCallback(async () => {
		if (unlocking.current) return;
		unlocking.current = true;
		try {
			const passed = await unlockWithBiometrics(t`Unlock Hisaab`).catch(
				() => false,
			);
			setFailed(!passed);
			if (passed) setLocked(false);
		} finally {
			unlocking.current = false;
		}
	}, [t]);

	if (Platform.OS === "web") return children;
	return (
		<View className="flex-1">
			{children}
			{/* Until the settings are read, nothing shows: a locked app never flashes its content. */}
			{(locked || covered || !started) && (
				<View className="absolute inset-0 bg-bg">
					{locked && (
						<LockScreen
							failed={failed}
							// A new screen each time it locks, so each lock asks once.
							key={lockCount}
							onUnlock={() => void unlock()}
						/>
					)}
				</View>
			)}
		</View>
	);
};
