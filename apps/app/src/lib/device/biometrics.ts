import {
	authenticateAsync,
	hasHardwareAsync,
	isEnrolledAsync,
} from "expo-local-authentication";

/** Whether this device can lock the app behind a biometric unlock: it has the hardware and someone enrolled. */
export const canLockWithBiometrics = async () =>
	(await hasHardwareAsync()) && (await isEnrolledAsync());

/** Asks for the device's biometric unlock (or its passcode, as the device allows); true when it passed. */
export const unlockWithBiometrics = async (prompt: string) =>
	(await authenticateAsync({ promptMessage: prompt })).success;
