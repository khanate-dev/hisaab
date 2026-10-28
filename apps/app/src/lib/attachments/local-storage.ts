import type { AttachmentData, LocalStorageAdapter } from "@powersync/common";
import { Directory, File, Paths } from "expo-file-system";

/** Attachment files kept on the device, in the app's documents folder, for uploading and opening offline. */
const folder = () => new Directory(Paths.document, "attachments");

const base64ToBytes = (base64: string) =>
	Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

export const createLocalStorage = (): LocalStorageAdapter => ({
	initialize: async () => {
		if (!folder().exists) folder().create({ intermediates: true });
	},
	clear: async () => {
		if (folder().exists) folder().delete();
		folder().create({ intermediates: true });
	},
	getLocalUri: (filename) => new File(folder(), filename).uri,
	saveFile: async (filePath, data: AttachmentData) => {
		const file = new File(filePath);
		if (!file.exists) file.create({ intermediates: true, overwrite: true });
		const bytes =
			typeof data === "string" ? base64ToBytes(data) : new Uint8Array(data);
		file.write(bytes);
		return bytes.byteLength;
	},
	readFile: async (filePath) => {
		const bytes = await new File(filePath).bytes();
		return bytes.buffer.slice(
			bytes.byteOffset,
			bytes.byteOffset + bytes.byteLength,
		) as ArrayBuffer;
	},
	deleteFile: async (filePath) => {
		const file = new File(filePath);
		if (file.exists) file.delete();
	},
	fileExists: async (filePath) => new File(filePath).exists,
	makeDir: async (path) => {
		const dir = new Directory(path);
		if (!dir.exists) dir.create({ intermediates: true });
	},
	rmDir: async (path) => {
		const dir = new Directory(path);
		if (dir.exists) dir.delete();
	},
});
