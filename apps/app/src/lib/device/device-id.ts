import AsyncStorage from "@react-native-async-storage/async-storage";

import { newId } from "../ids";

const KEY = "hisaab.device-id";

/** This device's own id, minted once and kept on it, so registering for push again changes its row (#61). */
export const deviceId = async () => {
	const saved = await AsyncStorage.getItem(KEY);
	if (saved) return saved;
	const id = newId();
	await AsyncStorage.setItem(KEY, id);
	return id;
};
