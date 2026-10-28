// Attachments (spec §3.4): up to 5 images or PDFs per Entry. Images are shrunk to about 2000px on their long edge
// before they're kept; PDFs are capped at about 10 MB. A small thumbnail syncs to every device with the row; the full
// file downloads when it's opened and stays cached. No OCR.

export const MAX_ATTACHMENTS = 5;
export const IMAGE_LONG_EDGE = 2000;
export const THUMBNAIL_LONG_EDGE = 240;
/** About 10 MB, for PDFs; a shrunk image is far smaller, but the same cap holds. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** What an Attachment can be, by media type, with the extension it's stored under. */
const KINDS = {
	"image/jpeg": { kind: "image", extension: "jpg" },
	"image/png": { kind: "image", extension: "png" },
	"image/webp": { kind: "image", extension: "webp" },
	"image/heic": { kind: "image", extension: "heic" },
	"application/pdf": { kind: "pdf", extension: "pdf" },
} as const;

export type AttachmentMediaType = keyof typeof KINDS;
export const ATTACHMENT_MEDIA_TYPES = Object.keys(
	KINDS,
) as AttachmentMediaType[];

export const isAttachmentMediaType = (
	type: string,
): type is AttachmentMediaType => Object.hasOwn(KINDS, type);

/** Whether it's an image (shrunk, with a thumbnail) or a PDF (kept as it is); null for anything else. */
export const attachmentKind = (type: string) =>
	isAttachmentMediaType(type) ? KINDS[type].kind : null;

export const attachmentExtension = (type: AttachmentMediaType) =>
	KINDS[type].extension;

/**
 * The size to shrink an image to, keeping its shape, so its long edge is at most `longEdge`; never enlarged. Each edge
 * is at least 1px.
 */
export const shrunkSize = (width: number, height: number, longEdge: number) => {
	const long = Math.max(width, height);
	if (long <= longEdge) return { width, height };
	const scale = longEdge / long;
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
};

/** Where an Attachment's file lives in Storage: under its household, which the bucket's policies check. */
export const attachmentPath = (
	householdId: string,
	attachmentId: string,
	type: AttachmentMediaType,
) => `${householdId}/${attachmentId}.${attachmentExtension(type)}`;

/** Why a file can't be attached to an Entry that already has `count`; null when it can. */
export const attachmentProblem = (
	count: number,
	file: { mediaType: string; bytes: number },
): "full" | "type" | "size" | null => {
	if (count >= MAX_ATTACHMENTS) return "full";
	if (!isAttachmentMediaType(file.mediaType)) return "type";
	if (file.bytes > MAX_ATTACHMENT_BYTES) return "size";
	return null;
};
