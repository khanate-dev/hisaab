import { File, Paths } from "expo-file-system";
import { shareAsync } from "expo-sharing";

/** The export's file name: the app's and the day's, a name for a file, not words for a person. */
export const exportFileName = (day: string) =>
	["hisaab-entries", day].join("-") + ".csv";

/** Hands a CSV to another app (Files, a spreadsheet, mail) through the share sheet. */
export const saveCsv = async (fileName: string, text: string) => {
	const file = new File(Paths.cache, fileName);
	if (file.exists) file.delete();
	file.create();
	file.write(text);
	await shareAsync(file.uri, {
		mimeType: "text/csv",
		UTI: "public.comma-separated-values-text",
	});
};
