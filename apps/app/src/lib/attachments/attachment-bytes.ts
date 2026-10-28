import {
	type AttachmentMediaType,
	attachmentExtension,
	attachmentPath,
} from "@hisaab/domain";

import { attachmentQueue } from "./queue";
import { downloadAttachment } from "./storage";

/** An Attachment's file: the copy kept on this device when there is one (say, not uploaded yet), else Storage's. */
export const attachmentBytes = async ({
	id,
	household_id,
	media_type,
}: {
	id: string;
	household_id: string;
	media_type: AttachmentMediaType;
}) => {
	const { localStorage } = attachmentQueue;
	const uri = localStorage.getLocalUri(
		`${id}.${attachmentExtension(media_type)}`,
	);
	return new Uint8Array(
		(await localStorage.fileExists(uri))
			? await localStorage.readFile(uri)
			: await downloadAttachment(attachmentPath(household_id, id, media_type)),
	);
};
