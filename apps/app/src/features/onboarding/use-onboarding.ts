import {
	entries,
	households,
	memberships,
	profiles,
	stamped,
	wallets,
} from "@hisaab/client-schema";
import { isZero, parseMoney } from "@hisaab/domain";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery, useStatus } from "@powersync/react";
import { and, eq, isNull } from "drizzle-orm";
import { useEffect } from "react";

import { usePersonalHousehold } from "@/features/households/use-personal-household";
import {
	clearPendingInvite,
	usePendingInvite,
} from "@/features/invites/pending-invite";
import { deviceTimeZone, nowIso, todayIn } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { db } from "@/lib/powersync";

import type { FirstWallet } from "./types";

export const ONBOARDING_STEP = {
	WAITING: "waiting",
	NAME: "name",
	FIRST_WALLET: "first-wallet",
	JOIN: "join",
	DONE: "done",
} as const;
export type OnboardingStep =
	(typeof ONBOARDING_STEP)[keyof typeof ONBOARDING_STEP];

/**
 * Where a signed-in User is in onboarding (Core flows ticket, #19): name, then First Wallet; or, arriving by Invite,
 * name, then Join, with no First Wallet. It waits for the first sync, so a returning User on a new device isn't sent
 * through it again, and a User who belongs to a shared household needs no First Wallet.
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

	// The shared households the User belongs to.
	const shared = useQuery(
		toCompilableQuery(
			db
				.select({ householdId: memberships.household_id })
				.from(memberships)
				.innerJoin(households, eq(households.id, memberships.household_id))
				.where(
					and(
						eq(memberships.user_id, userId),
						isNull(households.personal_user_id),
					),
				),
		),
	).data.map((row) => row.householdId);
	const invite = usePendingInvite();
	// Joined, and the Membership has synced: the Invite is done with.
	const arrived =
		invite?.joinedHouseholdId != null &&
		shared.includes(invite.joinedHouseholdId);
	useEffect(() => {
		if (arrived) void clearPendingInvite();
	}, [arrived]);

	if (!hasSynced || personal === undefined || invite === undefined)
		return ONBOARDING_STEP.WAITING;
	if (profile === undefined) return ONBOARDING_STEP.NAME;
	if (invite !== null && !arrived) return ONBOARDING_STEP.JOIN;
	if (!hasWallet && personal.base_currency === null && shared.length === 0)
		return ONBOARDING_STEP.FIRST_WALLET;
	return ONBOARDING_STEP.DONE;
};

export const saveName = async (userId: string, name: string) => {
	await db
		.insert(profiles)
		.values(stamped({ id: userId, display_name: name, created_at: nowIso() }));
};

/**
 * The Personal household's Base currency and timezone, its Cash wallet, and the opening balance as that Wallet's first Balance
 * adjustment (ADR-0002), in one local transaction: the Base currency uploads before the Entry that would lock it.
 */
export const createFirstWallet = async (
	userId: string,
	householdId: string,
	{ opening, currency }: FirstWallet,
	/** The Cash wallet's name, in the User's language. */
	cashName: string,
) => {
	// Stored in Money's canonical form; a zero opening (however it was typed) records no Entry, as Skip does.
	const amount = parseMoney(opening, currency);
	// The household's Entry dates are in this device's timezone until household settings change it (#40).
	const timezone = deviceTimeZone();
	await db.transaction(async (tx) => {
		await tx
			.update(households)
			.set(stamped({ base_currency: currency, timezone }))
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
		if (!isZero(amount)) {
			await tx.insert(entries).values(
				stamped({
					id: newId(),
					household_id: householdId,
					wallet_id: walletId,
					kind: "balance_adjustment" as const,
					amount: amount.toString(),
					occurred_on: todayIn(timezone),
					created_by: userId,
					created_at: nowIso(),
				}),
			);
		}
	});
};
