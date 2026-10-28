import type { LocalStorageAdapter } from "@powersync/common";
import { IndexDBFileSystemStorageAdapter } from "@powersync/web";

/** Attachment files kept in the browser (IndexedDB), for uploading once back online. */
export const createLocalStorage = (): LocalStorageAdapter =>
	new IndexDBFileSystemStorageAdapter("hisaab-attachments");
