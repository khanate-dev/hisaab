import { column, Schema, Table } from "@powersync/common";
import { getTableColumns } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import { STAMP_COLUMN } from "./stamp";

const columnType = (drizzleType: string) => {
	if (drizzleType === "SQLiteInteger") return column.integer;
	if (drizzleType === "SQLiteReal") return column.real;
	return column.text;
};

/**
 * A PowerSync table from a Drizzle table. The stamp column isn't a column at all: it turns on per-op metadata
 * (`trackMetadata`), so the contract version rides with each queued write instead of syncing.
 */
export const toPowerSyncTable = (
	table: SQLiteTable,
	options: { localOnly?: boolean } = {},
) => {
	let trackMetadata = false;
	const columns: Record<string, ReturnType<typeof columnType>> = {};
	for (const { name, columnType: drizzleType } of Object.values(
		getTableColumns(table),
	)) {
		if (name === "id") continue;
		if (name === STAMP_COLUMN) trackMetadata = true;
		else columns[name] = columnType(drizzleType);
	}
	return new Table(columns, { ...options, trackMetadata });
};

export { Schema };
