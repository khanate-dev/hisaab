import { openURL } from "expo-linking";

/** A file's local URI as an image or the device's viewer can show it: on native, the file:// URI itself. */
export const viewable = async (localUri: string, _mediaType?: string) =>
	localUri;

/**
 * Begins opening something in the device's viewer, before anything is awaited (the web needs that for a new tab);
 * `show` hands it the address once it's known.
 */
export const startOpening = () => ({
	show: (url: string) => openURL(url),
	cancel: () => {},
});
