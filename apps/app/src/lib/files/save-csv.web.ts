import { UTF8_BOM } from "./export-name";

/** Downloads a CSV. The link joins the page for the click, and the address outlives it, as Safari needs. */
export const saveCsv = async (fileName: string, text: string) => {
	const url = URL.createObjectURL(
		new Blob([UTF8_BOM, text], { type: "text/csv;charset=utf-8" }),
	);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
