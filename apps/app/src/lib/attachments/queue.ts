import { ATTACHMENT_QUEUE_TABLE } from "@hisaab/client-schema";
import { attachmentExtension, isAttachmentMediaType } from "@hisaab/domain";
import { AttachmentQueue, type AttachmentRecord } from "@powersync/common";

import { powersync } from "../powersync";
import { supabase } from "../supabase";

import { createLocalStorage } from "./local-storage";

/** The private bucket Attachment files live in (supabase/migrations/…_attachments.sql). */
export const ATTACHMENTS_BUCKET = "attachments";

/** Where the queue keeps a file's Storage path: in the record's metadata, so a delete still knows it once the row is gone. */
const pathOf = (record: AttachmentRecord) => {
	if (!record.metaData)
		throw new Error(`Attachment ${record.id} has no Storage path`);
	return record.metaData;
};

/**
 * Uploads Attachment files when the device is online, retrying until they land, across restarts (PowerSync's
 * AttachmentQueue, alpha). It only uploads and deletes: other devices' files aren't downloaded ahead of time, they're
 * fetched when opened.
 */
export const attachmentQueue = new AttachmentQueue({
	db: powersync,
	tableName: ATTACHMENT_QUEUE_TABLE,
	localStorage: createLocalStorage(),
	downloadAttachments: false,
	remoteStorage: {
		uploadFile: async (data, record) => {
			const { error } = await supabase.storage
				.from(ATTACHMENTS_BUCKET)
				.upload(pathOf(record), data, {
					contentType: record.mediaType ?? "application/octet-stream",
					upsert: true,
				});
			if (error) throw error;
		},
		downloadFile: async (record) => {
			const { data, error } = await supabase.storage
				.from(ATTACHMENTS_BUCKET)
				.download(pathOf(record));
			if (error) throw error;
			return data.arrayBuffer();
		},
		deleteFile: async (record) => {
			const { error } = await supabase.storage
				.from(ATTACHMENTS_BUCKET)
				.remove([pathOf(record)]);
			if (error) throw error;
		},
	},
	watchAttachments: (onUpdate, signal) => {
		void (async () => {
			for await (const { rows } of powersync.watch(
				"SELECT id, media_type FROM attachments",
				[],
				{ signal },
			)) {
				const items = (rows?._array ?? []) as {
					id: string;
					media_type: string;
				}[];
				await onUpdate(
					items.flatMap(({ id, media_type }) =>
						isAttachmentMediaType(media_type)
							? [
									{
										id,
										fileExtension: attachmentExtension(media_type),
										mediaType: media_type,
									},
								]
							: [],
					),
				);
			}
		})();
	},
});

/** A signed link to an Attachment's file, for opening it; good for an hour. */
export const attachmentLink = async (path: string) => {
	const { data, error } = await supabase.storage
		.from(ATTACHMENTS_BUCKET)
		.createSignedUrl(path, 3600);
	if (error) throw error;
	return data.signedUrl;
};
