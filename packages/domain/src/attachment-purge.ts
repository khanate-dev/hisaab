// Attachment purge (spec §3.4; issue #10 resolution 9): the files of Entries deleted more than 90 days ago, and of
// removed Attachments, are deleted from Storage, and a deleted household's at once; an Attachment whose row stays is
// marked purged, so a restored Entry shows it expired. The `purge-attachments` Edge Function runs this daily.
// No imports: the Edge Function loads this file in Deno.

/** A file due for purging, and the Attachment row to mark purged when it has one. */
export type PurgeCandidate = { path: string; attachmentId: string | null };

/** What the purge needs, as the service role. */
export type PurgeAdapters = {
	candidates: (limit: number) => Promise<PurgeCandidate[]>;
	/** Deletes files from Storage; one already gone is no error. */
	removeFiles: (paths: string[]) => Promise<void>;
	markPurged: (attachmentIds: string[]) => Promise<void>;
};

/** How many files one run takes; the next day takes the rest. */
export const PURGE_BATCH = 500;

/** Purges what's due once: files first, then their rows marked, so a failed delete is retried next time. */
export const purgeAttachments = async (adapters: PurgeAdapters) => {
	const due = await adapters.candidates(PURGE_BATCH);
	if (due.length === 0) return 0;
	await adapters.removeFiles(due.map((c) => c.path));
	const rows = due.flatMap((c) =>
		c.attachmentId === null ? [] : [c.attachmentId],
	);
	if (rows.length > 0) await adapters.markPurged(rows);
	return due.length;
};
