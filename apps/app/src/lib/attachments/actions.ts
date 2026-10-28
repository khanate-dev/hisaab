import { attachments, stamped, stampedDelete } from "@hisaab/client-schema";
import {
	type AttachmentMediaType,
	attachmentExtension,
	attachmentPath,
} from "@hisaab/domain";
import { eq } from "drizzle-orm";

import { nowIso } from "../dates";
import { newId } from "../ids";
import { db } from "../powersync";

import type { PreparedAttachment } from "./pick";
import { attachmentQueue } from "./queue";

/**
 * Adds an Attachment to an Entry: the file kept on the device and queued for upload, with its row (and thumbnail)
 * written in the same local transaction, so it shows at once and reaches everyone when the file is up.
 */
export const addAttachment = async (
	entry: { id: string; household_id: string },
	userId: string,
	file: PreparedAttachment,
) => {
	const id = newId();
	await attachmentQueue.saveFile({
		id,
		data: file.data,
		fileExtension: attachmentExtension(file.mediaType),
		mediaType: file.mediaType,
		metaData: attachmentPath(entry.household_id, id, file.mediaType),
		updateHook: async (tx) => {
			// The queue's own transaction, so the row is written with SQL; stamped like every synced write.
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
			const columns = Object.keys(row);
			await tx.execute(
				`INSERT INTO attachments (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
				Object.values(row),
			);
		},
	});
};

const ATTACHMENT_COLUMNS = [
	"id",
	"household_id",
	"entry_id",
	"media_type",
	"size_bytes",
	"file_name",
	"thumbnail",
	"created_by",
	"created_at",
] as const;

/**
 * Puts back an Attachment from a Full backup: its row, as the restore planned it, and its file queued for upload in
 * the same local transaction, as when it was first added.
 */
export const restoreAttachment = async (
	row: { id: string; household_id: string } & Record<string, unknown>,
	mediaType: AttachmentMediaType,
	bytes: Uint8Array,
) => {
	await attachmentQueue.saveFile({
		id: row.id,
		data: bytes.buffer.slice(
			bytes.byteOffset,
			bytes.byteOffset + bytes.byteLength,
		) as ArrayBuffer,
		fileExtension: attachmentExtension(mediaType),
		mediaType,
		metaData: attachmentPath(row.household_id, row.id, mediaType),
		updateHook: async (tx) => {
			// Its own columns only: the row comes from a file, so nothing else goes into the SQL.
			const values = stamped(
				Object.fromEntries(
					ATTACHMENT_COLUMNS.map((column) => [column, row[column] ?? null]),
				),
			);
			const columns = Object.keys(values);
			await tx.execute(
				`INSERT INTO attachments (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
				Object.values(values),
			);
		},
	});
};

/** Removes an Attachment from its Entry. Its file stays in Storage, to be purged later (spec §3.4). */
export const removeAttachment = async (attachmentId: string) => {
	await db
		.update(attachments)
		.set(stampedDelete())
		.where(eq(attachments.id, attachmentId));
};
