import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import {
	type PurgeAdapters,
	type PurgeCandidate,
	purgeAttachments,
} from "./attachment-purge";

const store = (due: PurgeCandidate[], removeFails = false) => {
	const calls: string[] = [];
	const adapters: PurgeAdapters = {
		candidates: async () => due,
		removeFiles: vi.fn(async (paths: string[]) => {
			calls.push("remove");
			if (removeFails) throw new Error("Storage down");
			expect(paths).toEqual(due.map((d) => d.path));
		}),
		markPurged: vi.fn(async (_ids: string[]) => {
			calls.push("mark");
		}),
	};
	return { adapters, calls };
};

describe("purgeAttachments", () => {
	it("deletes every due file, then marks purged exactly the rows that stay", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(
					fc.record({ path: fc.uuid(), attachmentId: fc.option(fc.uuid()) }),
					{ maxLength: 10 },
				),
				async (due) => {
					const { adapters, calls } = store(due);
					expect(await purgeAttachments(adapters)).toBe(due.length);
					const rows = due.flatMap((d) =>
						d.attachmentId === null ? [] : [d.attachmentId],
					);
					if (rows.length > 0)
						expect(adapters.markPurged).toHaveBeenCalledWith(rows);
					else expect(adapters.markPurged).not.toHaveBeenCalled();
					// Never a row marked before its file is gone.
					if (calls.includes("mark"))
						expect(calls.indexOf("mark")).toBeGreaterThan(
							calls.indexOf("remove"),
						);
				},
			),
		);
	});

	it("marks nothing when Storage fails, so the next run tries again", async () => {
		const { adapters } = store([{ path: "h/a.jpg", attachmentId: "a" }], true);
		await expect(purgeAttachments(adapters)).rejects.toThrow("Storage down");
		expect(adapters.markPurged).not.toHaveBeenCalled();
	});
});
