import { NO_ROWS } from "@hisaab/client-schema";
import {
	type AbstractPowerSyncDatabase,
	type CrudEntry,
	type PowerSyncBackendConnector,
	UpdateType,
} from "@powersync/common";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

// The one upload connector: the app ships it and tests/sync drives it. Lint keeps it free of React Native imports.

type ConnectorOptions = {
	/** Writes go through this client, so RLS judges them as the signed-in User. */
	supabase: SupabaseClient;
	powersyncUrl: string;
	getToken: () => Promise<string | null>;
};

type Outcome =
	| { rejected: false }
	| { rejected: true; code: string; message: string; sent: unknown };

/**
 * Only errors about this write itself are final: RLS or privileges (42501), constraints (23) and bad values (22).
 * Everything else retries: network, an unreachable database or pool (PGRST0xx), an expired token (PGRST3xx), and
 * schema mismatches (42703, 42P01, PGRST2xx) from a client ahead of the server, which the contract version gate handles.
 */
const isRejection = (error: PostgrestError) =>
	error.code === "42501" || /^(22|23)/.test(error.code);

const quoted = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

const localRow = (db: AbstractPowerSyncDatabase, entry: CrudEntry) =>
	db.getOptional<Record<string, unknown>>(
		`SELECT * FROM ${quoted(entry.table)} WHERE id = ?`,
		[entry.id],
	);

type Write = {
	sent: unknown;
	result: PromiseLike<{ data: unknown[] | null; error: PostgrestError | null }>;
};

const write = async (
	supabase: SupabaseClient,
	db: AbstractPowerSyncDatabase,
	entry: CrudEntry,
): Promise<Write | null> => {
	const table = supabase.from(entry.table);
	switch (entry.op) {
		case UpdateType.PUT: {
			const row = { ...entry.opData, id: entry.id };
			return { sent: row, result: table.upsert(row).select("id") };
		}
		case UpdateType.PATCH: {
			// Last writer wins per row (ADR-0007): send the whole local row, never PowerSync's changed fields.
			const row = await localRow(db, entry);
			// Deleted locally since: the DELETE queued after this update speaks for the row.
			if (row === null) return null;
			const { id: _id, ...columns } = row;
			return {
				sent: columns,
				result: table.update(columns).eq("id", entry.id).select("id"),
			};
		}
		case UpdateType.DELETE:
			return {
				sent: null,
				result: table.delete().eq("id", entry.id).select("id"),
			};
	}
};

/** A delete that matched nothing is done if the row is gone; if the User can still read it, RLS refused it. */
const stillReadable = async (supabase: SupabaseClient, entry: CrudEntry) => {
	const { data, error } = await supabase
		.from(entry.table)
		.select("id")
		.eq("id", entry.id);
	if (error) throw error;
	return data.length > 0;
};

const upload = async (
	supabase: SupabaseClient,
	db: AbstractPowerSyncDatabase,
	entry: CrudEntry,
): Promise<Outcome> => {
	const pending = await write(supabase, db, entry);
	if (pending === null) return { rejected: false };

	const { data, error } = await pending.result;
	if (error) {
		// Throwing keeps the transaction queued, and PowerSync retries it later.
		if (!isRejection(error)) throw error;
		return {
			rejected: true,
			code: error.code,
			message: error.message,
			sent: pending.sent,
		};
	}
	// RLS hides a rejected UPDATE or DELETE as "0 rows": that is a rejection, not a success.
	if (
		data?.length === 0 &&
		(entry.op !== UpdateType.DELETE || (await stillReadable(supabase, entry)))
	) {
		return {
			rejected: true,
			code: NO_ROWS,
			message: "The server didn't accept this change.",
			sent: pending.sent,
		};
	}
	return { rejected: false };
};

const recordRejection = (
	db: AbstractPowerSyncDatabase,
	transactionId: number | undefined,
	entry: CrudEntry,
	outcome: Extract<Outcome, { rejected: true }>,
) =>
	// A retried transaction meets the same entries again, so the record is keyed by entry and replaced.
	db.execute(
		`INSERT OR REPLACE INTO upload_errors (id, table_name, row_id, op, code, message, data, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			`${transactionId ?? "none"}:${entry.clientId}`,
			entry.table,
			entry.id,
			entry.op,
			outcome.code,
			outcome.message,
			outcome.sent === null ? null : JSON.stringify(outcome.sent),
			new Date().toISOString(),
		],
	);

export const createConnector = ({
	supabase,
	powersyncUrl,
	getToken,
}: ConnectorOptions): PowerSyncBackendConnector => ({
	fetchCredentials: async () => {
		const token = await getToken();
		return token === null ? null : { endpoint: powersyncUrl, token };
	},
	uploadData: async (db) => {
		const transaction = await db.getNextCrudTransaction();
		if (!transaction) return;

		for (const entry of transaction.crud) {
			const outcome = await upload(supabase, db, entry);
			// A rejected change is kept locally and the transaction completes, so the next sync restores the server's row.
			if (outcome.rejected)
				await recordRejection(db, transaction.transactionId, entry, outcome);
		}
		await transaction.complete();
	},
});
