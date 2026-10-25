import { stamped, wallets } from "@hisaab/client-schema";
import { eq } from "drizzle-orm";

import { nowIso } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { db } from "@/lib/powersync";

import type { WalletDraft } from "./wallet-form";

export const createWallet = async (
	householdId: string,
	{ name, type, currency }: WalletDraft,
) => {
	const id = newId();
	await db.insert(wallets).values(
		stamped({
			id,
			household_id: householdId,
			name,
			type,
			currency,
			created_at: nowIso(),
		}),
	);
	return id;
};

export const updateWallet = async (
	walletId: string,
	{ name, type, currency }: WalletDraft,
) => {
	await db
		.update(wallets)
		.set(stamped({ name, type, currency }))
		.where(eq(wallets.id, walletId));
};

/** Archived, never deleted, while Entries reference it (spec §3.2). */
export const archiveWallet = async (walletId: string) => {
	await db
		.update(wallets)
		.set(stamped({ archived_at: nowIso() }))
		.where(eq(wallets.id, walletId));
};

export const unarchiveWallet = async (walletId: string) => {
	await db
		.update(wallets)
		.set(stamped({ archived_at: null }))
		.where(eq(wallets.id, walletId));
};
