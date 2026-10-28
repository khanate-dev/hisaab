/** Opens an Attachment's file from its link in a new tab, leaving the app where it was. */
export const openFile = async (url: string) => {
	window.open(url, "_blank", "noopener");
};
