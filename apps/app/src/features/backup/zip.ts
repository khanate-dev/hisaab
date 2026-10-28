import { type FullBackup, readBackup } from "@hisaab/domain";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/** Where a Full backup's ZIP keeps its records and its Attachment files. */
const RECORDS = "backup.json";
const FILES = "attachments/";

/** A Full backup's ZIP: the records' JSON, and each Attachment file under its id. Files are stored, not squeezed. */
export const packBackup = (
	json: string,
	files: readonly { id: string; extension: string; bytes: Uint8Array }[],
) =>
	zipSync(
		{
			[RECORDS]: strToU8(json),
			...Object.fromEntries(
				files.map((f) => [
					`${FILES}${f.id}.${f.extension}`,
					[f.bytes, { level: 0 }] as const,
				]),
			),
		},
		{ level: 6 },
	);

export type UnpackedBackup =
	| { backup: FullBackup; files: ReadonlyMap<string, Uint8Array> }
	| { problem: "not_a_backup" | "newer_version" | "damaged" };

/** A picked file read as a Full backup: its records, and its Attachment files by id; a problem when it isn't one. */
export const unpackBackup = (bytes: Uint8Array): UnpackedBackup => {
	let entries: Record<string, Uint8Array>;
	try {
		entries = unzipSync(bytes);
	} catch {
		return { problem: "not_a_backup" };
	}
	const records = entries[RECORDS];
	if (!records) return { problem: "not_a_backup" };
	const read = readBackup(strFromU8(records));
	if ("problem" in read) return read;
	const files = new Map<string, Uint8Array>();
	for (const [name, data] of Object.entries(entries))
		if (name.startsWith(FILES))
			files.set(name.slice(FILES.length).replace(/\.[^.]*$/, ""), data);
	return { backup: read.backup, files };
};
