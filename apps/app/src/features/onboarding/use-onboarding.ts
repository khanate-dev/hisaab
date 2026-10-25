import {
	entries,
	households,
	profiles,
	stamped,
	wallets,
} from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery, useStatus } from "@powersync/react";
import { eq } from "drizzle-orm";

import { usePersonalHousehold } from "@/features/households/use-personal-household";
import { localToday, nowIso } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { db } from "@/lib/powersync";

import type { FirstWallet } from "./first-wallet-form";

export const ONBOARDING_STEP = {
	WAITING: "waiting",
	NAME: "name",
	FIRST_WALLET: "first-wallet",
	DONE: "done",
} as const;
export type OnboardingStep =
	(typeof ONBOARDING_STEP)[keyof typeof ONBOARDING_STEP];

/**
 * Where a signed-in User is in onboarding: name, then First Wallet (Core flows ticket, #19). It waits for the first
 * sync, so a returning User on a new device isn't sent through it again.
 */
export const useOnboardingStep = (userId: string): OnboardingStep => {
	const { hasSynced } = useStatus();
	const profile = useQuery(
		toCompilableQuery(
			db.select().from(profiles).where(eq(profiles.id, userId)),
		),
	).data[0];
	const personal = usePersonalHousehold(userId);
	const hasWallet =
		useQuery(
			toCompilableQuery(
				db
					.select({ id: wallets.id })
					.from(wallets)
					.where(eq(wallets.household_id, personal?.id ?? "")),
			),
		).data.length > 0;

	if (!hasSynced || personal === undefined) return ONBOARDING_STEP.WAITING;
	if (profile === undefined) return ONBOARDING_STEP.NAME;
	if (!hasWallet && personal.base_currency === null)
		return ONBOARDING_STEP.FIRST_WALLET;
	return ONBOARDING_STEP.DONE;
};

export const saveName = async (userId: string, name: string) => {
	await db
		.insert(profiles)
		.values(stamped({ id: userId, display_name: name, created_at: nowIso() }));
};

/**
 * The Personal household's Base currency, its Cash wallet, and the opening balance as that Wallet's first Balance
 * adjustment (ADR-0002), in one local transaction: the Base currency uploads before the Entry that would lock it.
 */
export const createFirstWallet = (
	userId: string,
	householdId: string,
	{ opening, currency }: FirstWallet,
	/** The Cash wallet's name, in the User's language. */
	cashName: string,
) =>
	db.transaction(async (tx) => {
		await tx
			.update(households)
			.set(stamped({ base_currency: currency }))
			.where(eq(households.id, householdId));
		const walletId = newId();
		await tx.insert(wallets).values(
			stamped({
				id: walletId,
				household_id: householdId,
				name: cashName,
				type: "cash" as const,
				currency,
				created_at: nowIso(),
			}),
		);
		if (opening !== "0") {
			await tx.insert(entries).values(
				stamped({
					id: newId(),
					household_id: householdId,
					wallet_id: walletId,
					kind: "balance_adjustment" as const,
					amount: opening,
					occurred_on: localToday(),
					created_by: userId,
					created_at: nowIso(),
				}),
			);
		}
	});
