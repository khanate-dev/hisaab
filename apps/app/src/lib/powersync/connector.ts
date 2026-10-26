import {
	CONTRACT_VERSION,
	NO_ROWS,
	readStamp,
	readStampTime,
	UNMAPPABLE,
} from "@hisaab/client-schema";
import {
	type QueuedOp,
	UPCASTERS,
	type Upcasters,
	UPDATE_REQUIRED_CODE,
	upcast,
} from "@hisaab/domain";
import {
	type AbstractPowerSyncDatabase,
	type CrudEntry,
	type PowerSyncBackendConnector,
} from "@powersync/common";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

// The one upload connector: the app ships it and tests/sync drives it. Lint keeps it free of React Native imports.

type ConnectorOptions = {
	/** Writes go through this client, so RLS judges them as the signed-in User. */
	supabase: SupabaseClient;
	powersyncUrl: string;
	getToken: () => Promise<string | null>;
	/** Called when the server answers 426: this build is below its minimum contract version (ADR-0009). */
	onUpdateRequired?: () => void;
	/** The contract version this build speaks, and the upcasters that bring older queued ops up to it. */
	contractVersion?: number;
	upcasters?: Upcasters;
};

type Outcome =
	| { rejected: false }
	| { rejected: true; code: string; message: string; sent: unknown };

/**
 * Only errors about this write itself are final: RLS or privileges (42501), constraints (23) and bad values (22).
 * Everything else retries: network, an unreachable database or pool (PGRST0xx), an expired token (PGRST3xx), and
 * schema mismatches (42703, 42P01, PGRST2xx) while the server catches up, and the contract version gate's 426.
 */
const isRejection = (error: PostgrestError) =>
	error.code === "42501" || /^(22|23)/.test(error.code);

const quoted = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

/**
 * PowerSync's own columns (`_metadata` for the contract stamp, `_deleted`) start with an underscore and are never
 * sent; Hisaab's columns never do. The stamp travels as the op's metadata instead.
 */
const withoutPowerSyncColumns = (values: Record<string, unknown>) =>
	Object.fromEntries(
		Object.entries(values).filter(([column]) => !column.startsWith("_")),
	);

const localRow = async (db: AbstractPowerSyncDatabase, entry: CrudEntry) => {
	const row = await db.getOptional<Record<string, unknown>>(
		`SELECT * FROM ${quoted(entry.table)} WHERE id = ?`,
		[entry.id],
	);
	return row === null ? null : withoutPowerSyncColumns(row);
};

const queuedOp = (entry: CrudEntry): QueuedOp => ({
	table: entry.table,
	op: entry.op,
	id: entry.id,
	data: entry.opData ? withoutPowerSyncColumns(entry.opData) : null,
});

type Write = {
	sent: unknown;
	result: PromiseLike<{ data: unknown[] | null; error: PostgrestError | null }>;
};

/** The Activity log's device time travels as a header the log trigger reads; a delete carries no stamp to say it. */
const DEVICE_TIME_HEADER = "x-device-time";

const write = async (
	supabase: SupabaseClient,
	db: AbstractPowerSyncDatabase,
	entry: CrudEntry,
	op: QueuedOp,
): Promise<Write | null> => {
	const table = supabase.from(op.table);
	const deviceTime = readStampTime(entry.metadata);
	const withTime = <
		B extends { setHeader: (name: string, value: string) => B },
	>(
		builder: B,
	) =>
		deviceTime === null
			? builder
			: builder.setHeader(DEVICE_TIME_HEADER, deviceTime);
	switch (op.op) {
		case "PUT": {
			const row = { ...op.data, id: op.id };
			return { sent: row, result: withTime(table.upsert(row).select("id")) };
		}
		case "PATCH": {
			// Last writer wins per row (ADR-0007): send the whole local row, never PowerSync's changed fields.
			// The row is read from the local table in this build's schema, so it is already this build's shape; the op's
			// own (upcast) values go on top, so an older build's change lands even when its column was renamed. Any
			// later change to the same row is queued after this op and overwrites it when it uploads.
			const row = await localRow(db, entry);
			// Deleted locally since: the DELETE queued after this update speaks for the row.
			if (row === null) return null;
			const { id: _id, ...columns } = { ...row, ...op.data };
			return {
				sent: columns,
				result: withTime(table.update(columns).eq("id", op.id).select("id")),
			};
		}
		case "DELETE":
			return {
				sent: null,
				result: table.delete().eq("id", op.id).select("id"),
			};
	}
};

/** A delete that matched nothing is done if the row is gone; if the User can still read it, RLS refused it. */
const stillReadable = async (supabase: SupabaseClient, op: QueuedOp) => {
	const { data, error } = await supabase
		.from(op.table)
		.select("id")
		.eq("id", op.id);
	if (error) throw error;
	return data.length > 0;
};

const upload = async (
	{
		supabase,
		onUpdateRequired,
		contractVersion = CONTRACT_VERSION,
		upcasters = UPCASTERS,
	}: ConnectorOptions,
	db: AbstractPowerSyncDatabase,
	entry: CrudEntry,
): Promise<Outcome> => {
	// ADR-0009: bring an op queued by an older build up to this build's contract. An unstamped op is this build's own.
	const original = queuedOp(entry);
	const writtenUnder = readStamp(entry.metadata) ?? contractVersion;
	const op = upcast(original, writtenUnder, contractVersion, upcasters);
	if (op === null) {
		return {
			rejected: true,
			code: UNMAPPABLE,
			message: `This change was made by an app speaking contract version ${writtenUnder} and can't be applied.`,
			sent: original.data,
		};
	}

	const pending = await write(supabase, db, entry, op);
	if (pending === null) return { rejected: false };

	const { data, error } = await pending.result;
	if (error) {
		// A too-old build waits: its queue is kept until the app is updated, and nothing becomes a Rejected change.
		if (error.code === UPDATE_REQUIRED_CODE) onUpdateRequired?.();
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
		(op.op !== "DELETE" || (await stillReadable(supabase, op)))
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

export const createConnector = (
	options: ConnectorOptions,
): PowerSyncBackendConnector => {
	// After a 426 the queue is paused: this build can't upload again, so later attempts stop before the network.
	let updateRequired = false;
	const uploadOptions: ConnectorOptions = {
		...options,
		onUpdateRequired: () => {
			updateRequired = true;
			options.onUpdateRequired?.();
		},
	};

	return {
		fetchCredentials: async () => {
			const token = await options.getToken();
			return token === null ? null : { endpoint: options.powersyncUrl, token };
		},
		uploadData: async (db) => {
			if (updateRequired)
				throw new Error(
					"Update required: uploads wait for a newer build of the app.",
				);
			const transaction = await db.getNextCrudTransaction();
			if (!transaction) return;

			// A retried transaction replays entries that already landed; that is safe because every write is
			// idempotent (an upsert, a whole-row update, or a delete that tolerates a missing row).
			for (const entry of transaction.crud) {
				const outcome = await upload(uploadOptions, db, entry);
				// A rejected change is kept locally and the transaction completes, so the next sync restores the server's row.
				if (outcome.rejected)
					await recordRejection(db, transaction.transactionId, entry, outcome);
			}
			await transaction.complete();
		},
	};
};
