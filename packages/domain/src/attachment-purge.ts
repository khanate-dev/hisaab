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

/** How many files one batch takes (Storage deletes this many at a time), and how many batches a run goes to. */
export const PURGE_BATCH = 500;
export const PURGE_BATCHES = 40;

/**
 * Purges what's due, batch by batch until nothing is (so a deleted household's files all go in one run, as the spec
 * has it "at once"): each batch's files first, then their rows marked, so a failed delete is retried next time. An
 * Entry restored during a run may lose its files a moment early; it was deleted 90 days or more.
 */
export const purgeAttachments = async (adapters: PurgeAdapters) => {
	let purged = 0;
	for (let batch = 0; batch < PURGE_BATCHES; batch += 1) {
		const due = await adapters.candidates(PURGE_BATCH);
		if (due.length === 0) break;
		await adapters.removeFiles(due.map((c) => c.path));
		const rows = due.flatMap((c) =>
			c.attachmentId === null ? [] : [c.attachmentId],
		);
		if (rows.length > 0) await adapters.markPurged(rows);
		purged += due.length;
		if (due.length < PURGE_BATCH) break;
	}
	return purged;
};
