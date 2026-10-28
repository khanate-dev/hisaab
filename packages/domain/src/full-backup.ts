// Full backup (spec §3.4; CONTEXT.md; #58): a complete copy of one household, every record plus its Attachment files,
// built and restored on an Admin's device with no server job. The records are JSON, one list per table; the app zips
// them with the files. Restoring makes a new household: every row gets a new id, references follow, the household's
// id replaces the old one, and the restorer stands in for whoever made each row (the server takes rows only in its
// writer's name). Occurrence ids, and the Entries Occurrences became, are derived again from the new rule ids
// (ADR-0004), so the restored household stays as consistent as the old one.

import { occurrenceEntryId, occurrenceId } from "./recurring";

export const BACKUP_FORMAT = "hisaab-full-backup";
/** Bumped when the JSON's shape changes; a backup of a later version is refused rather than misread. */
export const BACKUP_VERSION = 1;

/**
 * The tables a Full backup holds, in the order a restore writes them (each after what it refers to). Not in it: who's
 * in the household (Memberships, Invites, Profiles) and what's each User's own (Notifications, their preferences,
 * Saved filters).
 */
export const BACKUP_TABLES = [
	"wallets",
	"categories",
	"contacts",
	"loans",
	"budgets",
	"budget_overrides",
	"recurring_rules",
	"entries",
	"entry_items",
	"occurrences",
	"attachments",
	"import_mappings",
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

export type BackupValue = string | number | boolean | null;
/** One record, as its table's columns; every one has an `id`. */
export type BackupRow = { id: string } & Record<string, BackupValue>;

/** The household's own settings, carried to the new one. */
export type BackupHousehold = {
	name: string;
	base_currency: string | null;
	timezone: string | null;
	budget_month_start_day: number;
};

export type FullBackup = {
	format: typeof BACKUP_FORMAT;
	version: typeof BACKUP_VERSION;
	/** When it was made, ISO 8601. */
	created_at: string;
	household: BackupHousehold;
	tables: Record<BackupTable, BackupRow[]>;
};

/** The columns that never go in a backup: the household's id (replaced on restore) and PowerSync's own. */
const LEFT_OUT = new Set(["household_id", "_metadata", "_deleted"]);

/** A Full backup of a household's records, as read from the device. */
export const buildBackup = (
	household: BackupHousehold,
	tables: Record<BackupTable, readonly Record<string, unknown>[]>,
	createdAt: string,
): FullBackup => ({
	format: BACKUP_FORMAT,
	version: BACKUP_VERSION,
	created_at: createdAt,
	household: {
		name: household.name,
		base_currency: household.base_currency,
		timezone: household.timezone,
		budget_month_start_day: household.budget_month_start_day,
	},
	tables: Object.fromEntries(
		BACKUP_TABLES.map((table) => [
			table,
			tables[table].map(
				(row) =>
					Object.fromEntries(
						Object.entries(row).filter(([column]) => !LEFT_OUT.has(column)),
					) as BackupRow,
			),
		]),
	) as Record<BackupTable, BackupRow[]>,
});

export const backupJson = (backup: FullBackup) => JSON.stringify(backup);

/** Why a file isn't a backup this app can restore. */
export type BackupProblem = "not_a_backup" | "newer_version" | "damaged";

const isValue = (value: unknown): value is BackupValue =>
	value === null ||
	typeof value === "string" ||
	typeof value === "boolean" ||
	(typeof value === "number" && Number.isFinite(value));

const isRow = (value: unknown): value is BackupRow =>
	value !== null &&
	typeof value === "object" &&
	!Array.isArray(value) &&
	typeof (value as { id?: unknown }).id === "string" &&
	Object.values(value).every(isValue);

/** A Full backup's JSON, read and checked; a problem when it isn't one, is from a later app, or is damaged. */
export const readBackup = (
	text: string,
): { backup: FullBackup } | { problem: BackupProblem } => {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return { problem: "not_a_backup" };
	}
	if (raw === null || typeof raw !== "object")
		return { problem: "not_a_backup" };
	const { format, version, created_at, household, tables } = raw as Record<
		string,
		unknown
	>;
	if (format !== BACKUP_FORMAT) return { problem: "not_a_backup" };
	if (typeof version !== "number" || version > BACKUP_VERSION)
		return { problem: "newer_version" };
	if (version !== BACKUP_VERSION) return { problem: "damaged" };
	if (typeof created_at !== "string") return { problem: "damaged" };
	const h = household as Record<string, unknown> | null;
	if (
		h === null ||
		typeof h !== "object" ||
		typeof h.name !== "string" ||
		!(h.base_currency === null || typeof h.base_currency === "string") ||
		!(h.timezone === null || typeof h.timezone === "string") ||
		typeof h.budget_month_start_day !== "number"
	)
		return { problem: "damaged" };
	if (tables === null || typeof tables !== "object")
		return { problem: "damaged" };
	const lists = tables as Record<string, unknown>;
	for (const table of BACKUP_TABLES) {
		const rows = lists[table];
		if (!Array.isArray(rows) || !rows.every(isRow))
			return { problem: "damaged" };
	}
	return {
		backup: {
			format: BACKUP_FORMAT,
			version: BACKUP_VERSION,
			created_at,
			household: {
				name: h.name,
				base_currency: h.base_currency,
				timezone: h.timezone,
				budget_month_start_day: h.budget_month_start_day,
			},
			tables: Object.fromEntries(
				BACKUP_TABLES.map((table) => [table, lists[table]]),
			) as Record<BackupTable, BackupRow[]>,
		},
	};
};

/** What each table's rows refer to: a column, and the table its ids are from. Null refers to nothing. */
const REFERENCES: Record<
	BackupTable,
	{ column: string; table: BackupTable }[]
> = {
	wallets: [],
	categories: [{ column: "parent_id", table: "categories" }],
	contacts: [],
	loans: [{ column: "contact_id", table: "contacts" }],
	budgets: [{ column: "category_id", table: "categories" }],
	budget_overrides: [{ column: "category_id", table: "categories" }],
	recurring_rules: [
		{ column: "wallet_id", table: "wallets" },
		{ column: "category_id", table: "categories" },
	],
	entries: [
		{ column: "wallet_id", table: "wallets" },
		{ column: "to_wallet_id", table: "wallets" },
		{ column: "loan_id", table: "loans" },
		{ column: "category_id", table: "categories" },
	],
	entry_items: [
		{ column: "entry_id", table: "entries" },
		{ column: "category_id", table: "categories" },
	],
	// Its Entry id is derived again from its new rule (below), whether or not that Entry is still there.
	occurrences: [{ column: "rule_id", table: "recurring_rules" }],
	attachments: [{ column: "entry_id", table: "entries" }],
	import_mappings: [{ column: "wallet_id", table: "wallets" }],
};

/** The columns that say who made a row: the restorer, in the new household. */
const MADE_BY = ["created_by"];
/** The tables whose rows can be archived; restored unarchived, then archived once what refers to them is in. */
const ARCHIVABLE = new Set<BackupTable>(["wallets", "categories", "contacts"]);

/** An Attachment's file to carry over: from its id in the backup to its new one. */
export type RestoredFile = { from: string; to: string; mediaType: string };

export type RestorePlan = {
	/** Each table's rows for the new household, in `BACKUP_TABLES` order, Attachments aside. */
	tables: Record<Exclude<BackupTable, "attachments">, BackupRow[]>;
	/** Attachment rows, each written with its file. Ones whose file was purged aren't restored: the file is gone. */
	attachments: { row: BackupRow; file: RestoredFile }[];
	/** Rows to archive after the rest is in, Subcategories before their parents. */
	archive: { table: BackupTable; id: string; archived_at: string }[];
};

/**
 * How a Full backup restores into a new household: every id new (Occurrences', and the Entries they became, derived
 * from their new rule), references followed, the restorer as maker. A row whose reference isn't in the
 * backup is left out, and so are rows that need it, so what's restored is always whole.
 */
export const restorePlan = (
	backup: FullBackup,
	target: { householdId: string; userId: string },
	newId: () => string,
): RestorePlan => {
	const ids = new Map<BackupTable, Map<string, string>>(
		BACKUP_TABLES.map((table) => [table, new Map()]),
	);
	const idsOf = (table: BackupTable) => ids.get(table) ?? new Map();
	// The rule ids first: Occurrences, and the Entries they became, take theirs from them.
	for (const rule of backup.tables.recurring_rules)
		idsOf("recurring_rules").set(rule.id, newId());
	const derivedEntry = new Map<string, string>();
	for (const o of backup.tables.occurrences) {
		const newRule = idsOf("recurring_rules").get(String(o.rule_id));
		if (newRule && typeof o.entry_id === "string")
			derivedEntry.set(
				o.entry_id,
				occurrenceEntryId(newRule, String(o.due_on)),
			);
	}

	const restored = new Map<BackupTable, BackupRow[]>();
	const archive: RestorePlan["archive"] = [];
	for (const table of BACKUP_TABLES) {
		const rows: BackupRow[] = [];
		// Categories in two passes, top-level first, so a Subcategory's parent is mapped before it.
		const source =
			table === "categories"
				? backup.tables.categories.toSorted(
						(a, b) =>
							Number(a.parent_id !== null) - Number(b.parent_id !== null),
					)
				: backup.tables[table];
		for (const row of source) {
			const next: BackupRow = { ...row, household_id: target.householdId };
			let whole = true;
			for (const { column, table: from } of REFERENCES[table]) {
				const old = row[column];
				if (old === null || old === undefined) continue;
				const mapped = idsOf(from).get(String(old));
				if (mapped === undefined) whole = false;
				else next[column] = mapped;
			}
			if (!whole) continue;
			for (const column of MADE_BY)
				if (column in row) next[column] = target.userId;
			if (table === "entries") next.link_id = null;
			if (table === "occurrences") {
				const rule = String(next.rule_id);
				next.id = occurrenceId(rule, String(row.due_on));
				if (typeof row.entry_id === "string")
					next.entry_id = occurrenceEntryId(rule, String(row.due_on));
			} else if (table === "recurring_rules") {
				next.id = idsOf("recurring_rules").get(row.id) ?? newId();
			} else if (table === "entries") {
				next.id = derivedEntry.get(row.id) ?? newId();
			} else {
				next.id = newId();
			}
			if (
				table === "attachments" &&
				row.purged_at !== null &&
				row.purged_at !== undefined
			)
				continue;
			if (ARCHIVABLE.has(table) && typeof row.archived_at === "string") {
				archive.push({ table, id: next.id, archived_at: row.archived_at });
				next.archived_at = null;
			}
			idsOf(table).set(row.id, next.id);
			rows.push(next);
		}
		restored.set(table, rows);
	}

	const subcategories = new Set(
		(restored.get("categories") ?? [])
			.filter((c) => c.parent_id !== null)
			.map((c) => c.id),
	);
	archive.sort(
		(a, b) =>
			Number(!subcategories.has(a.id)) - Number(!subcategories.has(b.id)),
	);

	const { attachments: attachmentRows = [], ...rest } = Object.fromEntries(
		restored,
	) as Record<BackupTable, BackupRow[]>;
	const oldAttachmentIds = new Map(
		[...idsOf("attachments")].map(([from, to]) => [to, from]),
	);
	return {
		tables: rest as RestorePlan["tables"],
		attachments: attachmentRows.map((row) => ({
			row,
			file: {
				from: oldAttachmentIds.get(row.id) ?? row.id,
				to: row.id,
				mediaType: String(row.media_type),
			},
		})),
		archive,
	};
};
