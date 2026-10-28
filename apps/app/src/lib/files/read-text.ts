import { getDocumentAsync } from "expo-document-picker";
import { File } from "expo-file-system";

import { CSV_TYPES } from "./csv-types";

/** A CSV file the User picks, as text; null when they back out. */
export const chooseCsvText = async (): Promise<string | null> => {
	const result = await getDocumentAsync({
		type: [...CSV_TYPES],
		copyToCacheDirectory: true,
	});
	const asset = result.canceled ? undefined : result.assets[0];
	return asset ? new File(asset.uri).text() : null;
};
