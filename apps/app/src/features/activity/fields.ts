import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

/** How a changed field reads, by its kind of value. */
export type FieldKind =
	| "text"
	| "money"
	| "date"
	| "instant"
	| "wallet"
	| "category"
	| "entryKind"
	| "walletType";

type Field = {
	label: MessageDescriptor;
	kind: FieldKind;
	currencyFrom?: string;
};

/**
 * The fields the log shows when they change, in CONTEXT.md's words; anything else (ids, positions, icons) is left
 * out. `currencyFrom` names the field whose Wallet a money amount is in.
 */
export const LOGGED_FIELDS: Record<string, Record<string, Field>> = {
	entries: {
		description: { label: msg`Description`, kind: "text" },
		notes: { label: msg`Notes`, kind: "text" },
		amount: { label: msg`Amount`, kind: "money", currencyFrom: "wallet_id" },
		to_amount: {
			label: msg`Received`,
			kind: "money",
			currencyFrom: "to_wallet_id",
		},
		occurred_on: { label: msg`Date`, kind: "date" },
		occurred_time: { label: msg`Time`, kind: "text" },
		wallet_id: { label: msg`Wallet`, kind: "wallet" },
		to_wallet_id: { label: msg`To`, kind: "wallet" },
		category_id: { label: msg`Category`, kind: "category" },
		kind: { label: msg`Kind`, kind: "entryKind" },
	},
	entry_items: {
		description: { label: msg`Item`, kind: "text" },
		amount: { label: msg`Amount`, kind: "money" },
		quantity: { label: msg`Quantity`, kind: "text" },
		category_id: { label: msg`Category`, kind: "category" },
	},
	wallets: {
		name: { label: msg`Name`, kind: "text" },
		type: { label: msg`Type`, kind: "walletType" },
		currency: { label: msg`Currency`, kind: "text" },
		archived_at: { label: msg`Archived`, kind: "instant" },
	},
	categories: {
		name: { label: msg`Name`, kind: "text" },
		parent_id: { label: msg`Sits under`, kind: "category" },
		archived_at: { label: msg`Archived`, kind: "instant" },
	},
	households: {
		name: { label: msg`Name`, kind: "text" },
		base_currency: { label: msg`Base currency`, kind: "text" },
		timezone: { label: msg`Timezone`, kind: "text" },
	},
	memberships: {
		role: { label: msg`Role`, kind: "text" },
	},
};
