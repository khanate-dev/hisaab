/** No app lock on the web in v1 (spec §5). */
export const canLockWithBiometrics = async () => false;

/** Never passes: nothing on the web may rely on an unlock. */
export const unlockWithBiometrics = async (_prompt: string) => false;
