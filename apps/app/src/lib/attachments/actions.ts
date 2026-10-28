import { stamped, stampedDelete } from "@hisaab/client-schema";
import { attachmentExtension, attachmentPath } from "@hisaab/domain";

import { newId } from "../ids";
import { nowIso } from "../dates";

import type { PreparedFile } from "./pick";
import { attachmentQueue } from "./queue";

/**
 * Attaches a file to an Entry: kept on the device and queued for upload, with its row (and thumbnail) written in the
 * same local transaction, so it shows at once and syncs to everyone when the file is up.
 */
export const attachFile = async (
	entry: { id: string; household_id: string },
	userId: string,
	file: PreparedFile,
) => {
	const id = newId();
	const path = attachmentPath(entry.household_id, id, file.mediaType);
	await attachmentQueue.saveFile({
		id,
		data: file.data,
		fileExtension: attachmentExtension(file.mediaType),
		mediaType: file.mediaType,
		metaData: path,
		updateHook: async (tx) => {
			const row = stamped({
				id,
				household_id: entry.household_id,
				entry_id: entry.id,
				media_type: file.mediaType,
				size_bytes: file.data.byteLength,
				file_name: file.fileName,
				thumbnail: file.thumbnail,
				created_by: userId,
				created_at: nowIso(),
			});
			await tx.execute(
				`INSERT INTO attachments (id, household_id, entry_id, media_type, size_bytes, file_name, thumbnail, created_by, created_at, _metadata)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					row.id,
					row.household_id,
					row.entry_id,
					row.media_type,
					row.size_bytes,
					row.file_name,
					row.thumbnail,
					row.created_by,
					row.created_at,
					row._metadata,
				],
			);
		},
	});
};

/** Removes an Attachment: its row now, and its file from Storage once the device is online. */
export const removeAttachment = async (attachmentId: string) => {
	const { _metadata } = stampedDelete();
	await attachmentQueue.deleteFile({
		id: attachmentId,
		updateHook: async (tx) => {
			await tx.execute(
				"UPDATE attachments SET _deleted = 1, _metadata = ? WHERE id = ?",
				[_metadata, attachmentId],
			);
		},
	});
};
