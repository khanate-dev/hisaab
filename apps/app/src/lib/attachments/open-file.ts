import { openURL } from "expo-linking";

/** Opens an Attachment's file from its link, in the device's viewer for it. */
export const openFile = (url: string) => openURL(url);
