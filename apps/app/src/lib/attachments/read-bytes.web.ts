/** A picked or shrunk file's bytes, from its blob: or data: URI. */
export const readBytes = async (uri: string): Promise<ArrayBuffer> =>
	(await fetch(uri)).arrayBuffer();
