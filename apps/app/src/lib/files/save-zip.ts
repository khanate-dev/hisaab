import { File, Paths } from "expo-file-system";
import { shareAsync } from "expo-sharing";

/** Hands a ZIP to another app (Files, Drive, mail) through the share sheet. */
export const saveZip = async (fileName: string, bytes: Uint8Array) => {
	const file = new File(Paths.cache, fileName);
	if (file.exists) file.delete();
	file.create();
	file.write(bytes);
	await shareAsync(file.uri, {
		mimeType: "application/zip",
		UTI: "public.zip-archive",
	});
};
