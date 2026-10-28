import { File } from "expo-file-system";

/** A picked or shrunk file's bytes, from its file:// URI. */
export const readBytes = async (uri: string): Promise<ArrayBuffer> => {
	const bytes = await new File(uri).bytes();
	return bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
};
