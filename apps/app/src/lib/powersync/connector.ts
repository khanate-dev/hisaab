import {
	type AbstractPowerSyncDatabase,
	type CrudEntry,
	type PowerSyncBackendConnector,
	UpdateType,
} from "@powersync/common";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

// The one upload connector: the app ships it and tests/sync drives it. Keep it free of React Native imports.

type ConnectorOptions = {
	/** Writes go through this client, so RLS judges them as the signed-in User. */
	supabase: SupabaseClient;
	powersyncUrl: string;
	getToken: () => Promise<string | null>;
};

type Outcome =
	{ rejected: false } | { rejected: true; code: string; message: string };

/** Errors that retrying can't fix: bad data (22), constraints (23), privileges and RLS (42), PostgREST (PGRST). */
const isPermanent = (error: PostgrestError) =>
	/^(22|23|42|PGRST)/.test(error.code);

const quoted = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

/** Last writer wins per row (ADR-0007): an update sends the whole local row, not PowerSync's changed fields. */
const wholeRow = async (db: AbstractPowerSyncDatabase, entry: CrudEntry) => {
	const row = await db.getOptional<Record<string, unknown>>(
		`SELECT * FROM ${quoted(entry.table)} WHERE id = ?`,
		[entry.id],
	);
	if (row === null) return entry.opData ?? {};
	const { id: _id, ...columns } = row;
	return columns;
};

const write = async (
	supabase: SupabaseClient,
	db: AbstractPowerSyncDatabase,
	entry: CrudEntry,
) => {
	const table = supabase.from(entry.table);
	switch (entry.op) {
		case UpdateType.PUT:
			return table.upsert({ ...entry.opData, id: entry.id }).select("id");
		case UpdateType.PATCH:
			return table
				.update(await wholeRow(db, entry))
				.eq("id", entry.id)
				.select("id");
		case UpdateType.DELETE:
			return table.delete().eq("id", entry.id).select("id");
	}
};

const upload = async (
	supabase: SupabaseClient,
	db: AbstractPowerSyncDatabase,
	entry: CrudEntry,
): Promise<Outcome> => {
	const { data, error } = await write(supabase, db, entry);
	if (error) {
		// Anything else (network, 5xx) throws, so PowerSync keeps the transaction and retries it later.
		if (!isPermanent(error)) throw error;
		return { rejected: true, code: error.code, message: error.message };
	}
	// RLS hides a rejected UPDATE or DELETE as "0 rows": that is a rejection, not a success.
	if (data.length === 0) {
		return {
			rejected: true,
			code: "no_rows",
			message: "The server didn't accept this change.",
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
	db.execute(
		`INSERT INTO upload_errors (id, table_name, row_id, op, code, message, data, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			`${transactionId ?? "none"}:${entry.clientId}`,
			entry.table,
			entry.id,
			entry.op,
			outcome.code,
			outcome.message,
			entry.opData ? JSON.stringify(entry.opData) : null,
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
			// A rejected write is kept locally and the transaction completes, so the next sync restores the server's row.
			if (outcome.rejected)
				await recordRejection(db, transaction.transactionId, entry, outcome);
		}
		await transaction.complete();
	},
});
