import { supabase } from "../supabase";

/** The private bucket Attachment files live in (supabase/migrations/…_attachments.sql). */
export const ATTACHMENTS_BUCKET = "attachments";

const bucket = () => supabase.storage.from(ATTACHMENTS_BUCKET);

/** A signed link to an Attachment's file, good for an hour. */
export const attachmentLink = async (path: string) => {
	const { data, error } = await bucket().createSignedUrl(path, 3600);
	if (error) throw error;
	return data.signedUrl;
};

export const downloadAttachment = async (path: string) => {
	const { data, error } = await bucket().download(path);
	if (error) throw error;
	return data.arrayBuffer();
};

export const uploadAttachment = async (
	path: string,
	data: ArrayBuffer,
	mediaType: string,
) => {
	const { error } = await bucket().upload(path, data, {
		contentType: mediaType,
		upsert: true,
	});
	if (error) throw error;
};

export const deleteAttachmentFile = async (path: string) => {
	const { error } = await bucket().remove([path]);
	if (error) throw error;
};
