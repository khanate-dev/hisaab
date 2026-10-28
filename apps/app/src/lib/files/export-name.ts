/** The export's file name: the app's and the day's, a name for a file, not words for a person. */
export const exportFileName = (day: string) =>
	["hisaab-entries", day].join("-") + ".csv";

/** A Full backup's file name: the app's, the household's and the day's. */
export const backupFileName = (household: string, day: string) =>
	[
		"hisaab-backup",
		household.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") ||
			"household",
		day,
	].join("-") + ".zip";

/** Spreadsheets read a CSV as UTF-8 (Urdu names included) only when it starts with a byte-order mark. */
export const UTF8_BOM = "﻿";
