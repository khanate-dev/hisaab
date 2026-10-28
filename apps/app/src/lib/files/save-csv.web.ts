/** The export's file name: the app's and the day's, a name for a file, not words for a person. */
export const exportFileName = (day: string) =>
	["hisaab-entries", day].join("-") + ".csv";

/** Downloads a CSV, with a byte-order mark so spreadsheets read it as UTF-8. */
export const saveCsv = async (fileName: string, text: string) => {
	const url = URL.createObjectURL(
		new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }),
	);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.click();
	URL.revokeObjectURL(url);
};
