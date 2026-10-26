import { column, Table } from "@powersync/common";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";

import { DELETED_COLUMN, STAMP_COLUMN } from "./stamp";

// PowerSync stores every column as text, integer or real; booleans and timestamps in integer mode are integers.
const COLUMN_TYPES: Record<string, typeof column.text> = {
	SQLiteText: column.text,
	SQLiteTextJson: column.text,
	SQLiteInteger: column.integer,
	SQLiteBoolean: column.integer,
	SQLiteTimestamp: column.integer,
	SQLiteReal: column.real,
};

/**
 * A PowerSync table from a Drizzle table. The stamp column isn't a column at all: it turns on per-op metadata
 * (`trackMetadata`), so the contract version rides with each queued write instead of syncing.
 */
export const toPowerSyncTable = (
	table: SQLiteTable,
	options: { localOnly?: boolean } = {},
) => {
	const { name: tableName, indexes } = getTableConfig(table);
	if (indexes.length > 0)
		throw new Error(
			`${tableName}: Drizzle indexes aren't converted to PowerSync yet`,
		);

	let trackMetadata = false;
	const columns: Record<string, typeof column.text> = {};
	for (const { name, columnType } of Object.values(getTableColumns(table))) {
		if (name === "id") continue;
		if (name === STAMP_COLUMN) {
			trackMetadata = true;
			continue;
		}
		// PowerSync provides the delete flag itself once a table tracks metadata.
		if (name === DELETED_COLUMN) continue;
		const type = COLUMN_TYPES[columnType];
		if (!type)
			throw new Error(
				`${tableName}.${name}: no PowerSync type for Drizzle ${columnType}`,
			);
		columns[name] = type;
	}
	return new Table(columns, { ...options, trackMetadata });
};
