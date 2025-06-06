import { sql } from "drizzle-orm";
import * as t from "drizzle-orm/sqlite-core";

import { userRoles } from "./enums";

import type { SQL } from "drizzle-orm";

export const lower = (email: t.AnySQLiteColumn): SQL => {
	return sql`lower(${email})`;
};

export const metaColumns = {
	created_at: t
		.text()
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
	updated_at: t.text(),
	deleted_at: t.text(),
};

export const users = t.sqliteTable(
	"users",
	{
		id: t.int().primaryKey({ autoIncrement: true }),
		username: t.text().notNull().unique(),
		email: t.text().notNull(),
		password: t.text().notNull(),
		...metaColumns,
	},
	(table) => [t.uniqueIndex("users_username_email").on(lower(table.email))],
);

export const sessions = t.sqliteTable("sessions", {
	id: t.int().primaryKey({ autoIncrement: true }),
	user_id: t
		.int()
		.notNull()
		.references(() => users.id),
	started_at: t.int({ mode: "timestamp" }).notNull(),
	last_active_at: t.int({ mode: "timestamp" }).notNull(),
	expired_at: t.int({ mode: "timestamp" }),
});

export const households = t.sqliteTable("households", {
	id: t.int().primaryKey({ autoIncrement: true }),
	name: t.text().unique().notNull(),
	description: t.text().notNull().default(""),
	invite_code: t.text().notNull().unique(),
	...metaColumns,
});

export const user_households = t.sqliteTable("user_households", {
	id: t.int().primaryKey({ autoIncrement: true }),
	user_id: t
		.int()
		.notNull()
		.references(() => users.id),
	household_id: t
		.int()
		.notNull()
		.references(() => households.id),
	role: t.text({ enum: userRoles }).notNull(),
	is_disabled: t.int({ mode: "boolean" }).notNull().default(false),
	is_default: t.int({ mode: "boolean" }).notNull().default(false),
	...metaColumns,
});

export const wallets = t.sqliteTable("wallets", {
	id: t.int().primaryKey({ autoIncrement: true }),
	name: t.text().notNull(),
	description: t.text().notNull().default(""),
	balance: t.int().notNull().default(0),
	user_id: t
		.int()
		.notNull()
		.references(() => users.id),
	household_id: t.int().references(() => households.id),
	is_disabled: t.int({ mode: "boolean" }).notNull().default(false),
	is_default: t.int({ mode: "boolean" }).notNull().default(false),
	...metaColumns,
});

export const transfers = t.sqliteTable("transfers", {
	id: t.int().primaryKey({ autoIncrement: true }),
	amount: t.int().notNull(),
	description: t.text().notNull().default(""),
	from_wallet_id: t
		.int()
		.notNull()
		.references(() => wallets.id),
	to_wallet_id: t
		.int()
		.notNull()
		.references(() => wallets.id),
	created_at: metaColumns.created_at,
});

export const loans = t.sqliteTable("loans", {
	id: t.int().primaryKey({ autoIncrement: true }),
	amount: t.int().notNull(),
	description: t.text().notNull().default(""),
	wallet_id: t
		.int()
		.notNull()
		.references(() => wallets.id),
	lender: t.text(),
	borrower: t.text(),
	payback_date: t.int({ mode: "timestamp" }).notNull(),
	paid_back_at: t.int({ mode: "timestamp" }),
	...metaColumns,
});

export const income_categories = t.sqliteTable("income_categories", {
	id: t.int().primaryKey({ autoIncrement: true }),
	name: t.text().notNull().unique(),
	description: t.text().notNull().default(""),
	is_disabled: t.int({ mode: "boolean" }).notNull().default(false),
	...metaColumns,
});

export const income_budgets = t.sqliteTable("income_budgets", {
	id: t.int().primaryKey({ autoIncrement: true }),
	amount: t.int().notNull(),
	description: t.text().notNull().default(""),
	income_category_id: t
		.int()
		.notNull()
		.references(() => income_categories.id),
	household_id: t
		.int()
		.notNull()
		.references(() => households.id),
	year: t.int().notNull(),
	month: t.int().notNull(),
	...metaColumns,
});

export const incomes = t.sqliteTable("incomes", {
	id: t.int().primaryKey({ autoIncrement: true }),
	amount: t.int().notNull(),
	date: t.int({ mode: "timestamp" }).notNull(),
	description: t.text().notNull().default(""),
	income_category_id: t
		.int()
		.notNull()
		.references(() => income_categories.id),
	wallet_id: t
		.int()
		.notNull()
		.references(() => wallets.id),
	...metaColumns,
});

export const expense_categories = t.sqliteTable("expense_categories", {
	id: t.int().primaryKey({ autoIncrement: true }),
	name: t.text().notNull().unique(),
	description: t.text().notNull().default(""),
	is_disabled: t.int({ mode: "boolean" }).notNull().default(false),
	...metaColumns,
});

export const expense_budgets = t.sqliteTable("expense_budgets", {
	id: t.int().primaryKey({ autoIncrement: true }),
	amount: t.int().notNull(),
	description: t.text().notNull().default(""),
	expense_category_id: t
		.int()
		.notNull()
		.references(() => expense_categories.id),
	household_id: t
		.int()
		.notNull()
		.references(() => households.id),
	year: t.int().notNull(),
	month: t.int().notNull(),
	...metaColumns,
});

export const expenses = t.sqliteTable("expenses", {
	id: t.int().primaryKey({ autoIncrement: true }),
	amount: t.int().notNull(),
	date: t.int({ mode: "timestamp" }).notNull(),
	description: t.text().notNull().default(""),
	expense_category_id: t
		.int()
		.notNull()
		.references(() => expense_categories.id),
	wallet_id: t
		.int()
		.notNull()
		.references(() => wallets.id),
	item_count: t.int().notNull(),
	...metaColumns,
});

export const expense_items = t.sqliteTable("expense_items", {
	id: t.int().primaryKey({ autoIncrement: true }),
	amount: t.int().notNull(),
	description: t.text().notNull().default(""),
	expense_id: t
		.int()
		.notNull()
		.references(() => expenses.id),
	...metaColumns,
});

export const logs = t.sqliteTable("logs", {
	id: t.int().primaryKey({ autoIncrement: true }),
	target_table: t.text().notNull(),
	target_id: t.int().notNull(),
	type: t.text({ enum: ["add", "update", "delete"] }).notNull(),
	user_id: t
		.int()
		.notNull()
		.references(() => users.id),
	created_at: metaColumns.created_at,
});
