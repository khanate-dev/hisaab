import {
	type AttachmentMediaType,
	attachmentExtension,
	attachmentKind,
	attachmentPath,
} from "@hisaab/domain";

import { startOpening, viewable } from "./open";
import { attachmentQueue } from "./queue";
import { attachmentLink, downloadAttachment } from "./storage";

export type OpenableAttachment = {
	id: string;
	household_id: string;
	media_type: AttachmentMediaType;
};

/**
 * The Attachment's file on this device, fetched from Storage the first time and kept after (spec §3.4: full files
 * download lazily and stay cached). One attached here, or opened before, works offline.
 */
const localCopy = async ({
	id,
	household_id,
	media_type,
}: OpenableAttachment) => {
	const { localStorage } = attachmentQueue;
	const uri = localStorage.getLocalUri(
		`${id}.${attachmentExtension(media_type)}`,
	);
	if (!(await localStorage.fileExists(uri)))
		await localStorage.saveFile(
			uri,
			await downloadAttachment(attachmentPath(household_id, id, media_type)),
		);
	return uri;
};

/**
 * Opens an Attachment: an image as an address to show in the app; a PDF in the device's viewer (on native, through a
 * signed link while online, as viewers can't always read the app's own files). Throws when it can't be had.
 */
export const openAttachment = async (
	attachment: OpenableAttachment,
): Promise<{ image: string } | { opened: true }> => {
	const { id, household_id, media_type } = attachment;
	if (attachmentKind(media_type) === "image")
		return { image: await viewable(await localCopy(attachment), media_type) };
	const opener = startOpening();
	try {
		const local = await localCopy(attachment);
		// A device viewer can't always read the app's own file:// files, so a signed link goes first while online.
		const url = local.startsWith("file:")
			? await attachmentLink(
					attachmentPath(household_id, id, media_type),
				).catch(() => local)
			: await viewable(local, media_type);
		await opener.show(url);
		return { opened: true };
	} catch (error) {
		opener.cancel();
		throw error;
	}
};
