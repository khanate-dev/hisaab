import { ATTACHMENT_QUEUE_TABLE } from "@hisaab/client-schema";
import { attachmentExtension, isAttachmentMediaType } from "@hisaab/domain";
import { AttachmentQueue, type AttachmentRecord } from "@powersync/common";

import { powersync } from "../powersync";

import { createLocalStorage } from "./local-storage";
import {
	deleteAttachmentFile,
	downloadAttachment,
	uploadAttachment,
} from "./storage";

/** The queue keeps a file's Storage path in the record's metadata, so a delete still knows it once the row is gone. */
const storagePath = (record: AttachmentRecord) => {
	if (!record.metaData)
		throw new Error(`Attachment ${record.id} has no Storage path`);
	return record.metaData;
};

/** Whether the Attachment's row is still on this device; a row the server refused is gone, and so is the need to upload. */
const rowExists = async (id: string) =>
	(await powersync.getOptional("SELECT id FROM attachments WHERE id = ?", [
		id,
	])) !== null;

/**
 * Uploads Attachment files when the device is online, retrying until they land, across restarts (PowerSync's
 * AttachmentQueue, alpha). It only uploads: other devices' files are fetched when opened (`openAttachment`), and a
 * removed Attachment's file stays in Storage until it's purged.
 */
export const attachmentQueue = new AttachmentQueue({
	db: powersync,
	tableName: ATTACHMENT_QUEUE_TABLE,
	localStorage: createLocalStorage(),
	downloadAttachments: false,
	remoteStorage: {
		uploadFile: (data, record) =>
			uploadAttachment(
				storagePath(record),
				data,
				record.mediaType ?? "application/octet-stream",
			),
		downloadFile: (record) => downloadAttachment(storagePath(record)),
		deleteFile: (record) => deleteAttachmentFile(storagePath(record)),
	},
	// Retried while the row is still here (Storage refuses a file until its row has uploaded); given up once it's gone.
	errorHandler: {
		onUploadError: (record) => rowExists(record.id),
		onDownloadError: async () => false,
		onDeleteError: async () => false,
	},
	watchAttachments: (onUpdate, signal) => {
		const watch = async () => {
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
		};
		watch().catch((error: unknown) => {
			if (!signal.aborted) console.warn("Attachment watch stopped", error);
		});
	},
});

/** Starts uploading; the queue picks up where it left off. */
export const startAttachments = () =>
	attachmentQueue.startSync().catch((error: unknown) => {
		console.warn("Attachment queue didn't start", error);
	});

export const stopAttachments = () => attachmentQueue.stopSync();

/** On sign-out: stops, forgets the queue and wipes the files kept on this device. */
export const clearAttachments = async () => {
	await attachmentQueue.stopSync();
	await attachmentQueue.clearQueue();
	await attachmentQueue.localStorage.clear();
};
