import { getDocumentAsync } from "expo-document-picker";

import { ZIP_TYPES } from "./zip-types";

/** A ZIP the User picks, as bytes; null when they back out. */
export const chooseZipBytes = async (): Promise<Uint8Array | null> => {
	const result = await getDocumentAsync({ type: [...ZIP_TYPES] });
	const asset = result.canceled ? undefined : result.assets[0];
	return asset
		? new Uint8Array(await (await fetch(asset.uri)).arrayBuffer())
		: null;
};
