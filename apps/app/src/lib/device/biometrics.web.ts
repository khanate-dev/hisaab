/** No app lock on the web in v1 (spec §5). */
export const canLockWithBiometrics = async () => false;

export const unlockWithBiometrics = async (_prompt: string) => true;
