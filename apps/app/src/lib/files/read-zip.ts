import { getDocumentAsync } from "expo-document-picker";
import { File } from "expo-file-system";

import { ZIP_TYPES } from "./zip-types";

/** A ZIP the User picks, as bytes; null when they back out. */
export const chooseZipBytes = async (): Promise<Uint8Array | null> => {
	const result = await getDocumentAsync({
		type: [...ZIP_TYPES],
		copyToCacheDirectory: true,
	});
	const asset = result.canceled ? undefined : result.assets[0];
	return asset ? new File(asset.uri).bytes() : null;
};
