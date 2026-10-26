import type { Entry } from "@/features/entries/types";

/** A synced Entry row for tests: a PKR 450 Expense from Cash unless told otherwise. */
export const makeEntry = (
	id: string,
	overrides: Partial<Entry> = {},
): Entry => ({
	id,
	household_id: "h1",
	wallet_id: "w1",
	to_wallet_id: null,
	loan_id: null,
	kind: "expense",
	amount: "-450",
	to_amount: null,
	category_id: "c2",
	occurred_on: "2026-10-20",
	occurred_time: null,
	description: null,
	notes: null,
	created_by: "u1",
	created_at: "2026-10-20T10:00:00.000Z",
	_metadata: null,
	_deleted: null,
	...overrides,
});
