import { attachmentQueue } from "./queue";

/** A file kept in IndexedDB as an address the browser can show: a blob: URL of its bytes. */
export const viewable = async (localUri: string, mediaType?: string) =>
	URL.createObjectURL(
		new Blob(
			[await attachmentQueue.localStorage.readFile(localUri)],
			mediaType ? { type: mediaType } : {},
		),
	);

/**
 * Begins opening something in a new tab while the press still counts as the User's (pop-up blockers allow only
 * that); `show` points the tab at it once its address is known, `cancel` closes it.
 */
export const startOpening = () => {
	const tab = window.open("about:blank", "_blank");
	return {
		show: async (url: string) => {
			if (tab) tab.location.href = url;
			else window.open(url, "_blank");
		},
		cancel: () => tab?.close(),
	};
};
