/** Downloads a ZIP. The link joins the page for the click, and the address outlives it, as Safari needs. */
export const saveZip = async (fileName: string, bytes: Uint8Array) => {
	const url = URL.createObjectURL(
		new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/zip" }),
	);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
