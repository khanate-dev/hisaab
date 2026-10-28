// Attachment purge (spec §3.4, #56): deletes the files of long-deleted Entries and removed Attachments, and a deleted
// household's, through the Storage API, daily (pg_cron). The logic is in packages/domain behind adapters (ADR-0010).
import {
	type PurgeAdapters,
	purgeAttachments,
} from "../../../packages/domain/src/attachment-purge.ts";
import { Forbidden, refused, serviceOnly } from "../_shared/service-only.ts";

const url = Deno.env.get("SUPABASE_URL");
if (!url) throw new Error("SUPABASE_URL must be set");

const adaptersFor = (key: string): PurgeAdapters => {
	const call = async (path: string, init: RequestInit) => {
		const response = await fetch(`${url}${path}`, {
			...init,
			headers: {
				apikey: key,
				Authorization: `Bearer ${key}`,
				"content-type": "application/json",
				...init.headers,
			},
		});
		if (refused(response.status)) throw new Forbidden();
		if (!response.ok)
			throw new Error(
				`${path} answered ${response.status}: ${await response.text()}`,
			);
		const text = await response.text();
		return text === "" ? null : JSON.parse(text);
	};
	return {
		candidates: async (limit) =>
			(
				(await call("/rest/v1/rpc/attachments_to_purge", {
					method: "POST",
					body: JSON.stringify({ batch: limit }),
				})) as { path: string; attachment_id: string | null }[]
			).map((row) => ({
				path: row.path,
				attachmentId: row.attachment_id,
			})),
		removeFiles: async (paths) => {
			await call("/storage/v1/object/attachments", {
				method: "DELETE",
				body: JSON.stringify({ prefixes: paths }),
			});
		},
		markPurged: async (ids) => {
			await call("/rest/v1/rpc/mark_attachments_purged", {
				method: "POST",
				body: JSON.stringify({ ids }),
			});
		},
	};
};

Deno.serve(
	serviceOnly(async (key) =>
		Response.json({
			status: "ok",
			purged: await purgeAttachments(adaptersFor(key)),
		}),
	),
);
