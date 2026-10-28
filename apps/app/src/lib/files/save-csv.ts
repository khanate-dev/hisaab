import { File, Paths } from "expo-file-system";
import { shareAsync } from "expo-sharing";

import { UTF8_BOM } from "./export-name";

/** Hands a CSV to another app (Files, a spreadsheet, mail) through the share sheet. */
export const saveCsv = async (fileName: string, text: string) => {
	const file = new File(Paths.cache, fileName);
	if (file.exists) file.delete();
	file.create();
	file.write(UTF8_BOM + text);
	await shareAsync(file.uri, {
		mimeType: "text/csv",
		UTI: "public.comma-separated-values-text",
	});
};
