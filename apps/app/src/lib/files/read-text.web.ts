import { getDocumentAsync } from "expo-document-picker";

import { CSV_TYPES } from "./csv-types";

/** A CSV file the User picks, as text; null when they back out. */
export const chooseCsvText = async (): Promise<string | null> => {
	const result = await getDocumentAsync({ type: [...CSV_TYPES] });
	const asset = result.canceled ? undefined : result.assets[0];
	return asset ? (await fetch(asset.uri)).text() : null;
};
