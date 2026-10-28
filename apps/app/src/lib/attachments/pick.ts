import {
	IMAGE_LONG_EDGE,
	isAttachmentMediaType,
	shrunkSize,
	THUMBNAIL_LONG_EDGE,
	type AttachmentMediaType,
} from "@hisaab/domain";
import { getDocumentAsync } from "expo-document-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { launchImageLibraryAsync } from "expo-image-picker";

import { readBytes } from "./read-bytes";

/** A file ready to attach: shrunk if it's an image, with its thumbnail. */
export type PreparedFile = {
	data: ArrayBuffer;
	mediaType: AttachmentMediaType;
	fileName: string | null;
	/** A small JPEG data URL for images; null for PDFs. */
	thumbnail: string | null;
};

/** Why a picked file can't be attached: not an image or PDF. */
export class UnsupportedFile extends Error {}

const JPEG: AttachmentMediaType = "image/jpeg";

/** An image shrunk to about 2000px as a JPEG, plus a thumbnail (spec §3.4). */
const prepareImage = async (
	uri: string,
	width: number,
	height: number,
	fileName: string | null,
): Promise<PreparedFile> => {
	const full = shrunkSize(width, height, IMAGE_LONG_EDGE);
	const image = await ImageManipulator.manipulate(uri)
		.resize(full)
		.renderAsync();
	const saved = await image.saveAsync({
		compress: 0.8,
		format: SaveFormat.JPEG,
	});
	const small = shrunkSize(width, height, THUMBNAIL_LONG_EDGE);
	const thumb = await (
		await ImageManipulator.manipulate(uri).resize(small).renderAsync()
	).saveAsync({
		compress: 0.6,
		format: SaveFormat.JPEG,
		base64: true,
	});
	return {
		data: await readBytes(saved.uri),
		mediaType: JPEG,
		fileName,
		thumbnail:
			thumb.base64 === undefined
				? null
				: `data:image/jpeg;base64,${thumb.base64}`,
	};
};

/** A photo from the library; null when the User backs out. */
export const pickPhoto = async (): Promise<PreparedFile | null> => {
	const result = await launchImageLibraryAsync({
		mediaTypes: ["images"],
		quality: 1,
	});
	const asset = result.canceled ? undefined : result.assets[0];
	if (!asset) return null;
	return prepareImage(
		asset.uri,
		asset.width,
		asset.height,
		asset.fileName ?? null,
	);
};

/** A PDF or an image from files; null when the User backs out. */
export const pickFile = async (): Promise<PreparedFile | null> => {
	const result = await getDocumentAsync({
		type: ["application/pdf", "image/*"],
		copyToCacheDirectory: true,
	});
	const asset = result.canceled ? undefined : result.assets[0];
	if (!asset) return null;
	const type = asset.mimeType ?? "";
	if (!isAttachmentMediaType(type)) throw new UnsupportedFile(type);
	if (type === "application/pdf")
		return {
			data: await readBytes(asset.uri),
			mediaType: type,
			fileName: asset.name,
			thumbnail: null,
		};
	// An image's size is read from a first render, then it's shrunk like a photo.
	const original = await ImageManipulator.manipulate(asset.uri).renderAsync();
	return prepareImage(asset.uri, original.width, original.height, asset.name);
};
