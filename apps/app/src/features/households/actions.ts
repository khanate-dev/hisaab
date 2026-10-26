import { households, memberships, stamped } from "@hisaab/client-schema";
import { eq } from "drizzle-orm";

import { nowIso } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { updateDeviceState } from "@/lib/device-state";
import { db } from "@/lib/powersync";

export type HouseholdDraft = {
	name: string;
	baseCurrency: string;
	timeZone: string;
};

/** What an Admin sets in household settings; a Personal household keeps its name. */
export type HouseholdSettings = {
	name?: string;
	baseCurrency: string;
	budgetMonthStartDay: number;
	timeZone: string;
};

/** A shared household with its founder as its first Admin; the server gives it the template Categories. */
export const createHousehold = async (
	userId: string,
	draft: HouseholdDraft,
) => {
	const id = newId();
	const createdAt = nowIso();
	await db.transaction(async (tx) => {
		// The household first: the server lets its founder join it only once it exists.
		await tx.insert(households).values(
			stamped({
				id,
				name: draft.name.trim(),
				personal_user_id: null,
				base_currency: draft.baseCurrency,
				timezone: draft.timeZone,
				budget_month_start_day: 1,
				created_by: userId,
				created_at: createdAt,
			}),
		);
		await tx.insert(memberships).values(
			stamped({
				id: newId(),
				household_id: id,
				user_id: userId,
				role: "admin",
				default_wallet_id: null,
				created_at: createdAt,
			}),
		);
	});
	return id;
};

export const updateHouseholdSettings = async (
	householdId: string,
	settings: HouseholdSettings,
) => {
	await db
		.update(households)
		.set(
			stamped({
				...(settings.name !== undefined && { name: settings.name.trim() }),
				base_currency: settings.baseCurrency,
				budget_month_start_day: settings.budgetMonthStartDay,
				timezone: settings.timeZone,
			}),
		)
		.where(eq(households.id, householdId));
};

/** The Member's own default Wallet in a household, for new Entries; null for none. */
export const setDefaultWallet = async (
	membershipId: string,
	walletId: string | null,
) => {
	await db
		.update(memberships)
		.set(stamped({ default_wallet_id: walletId }))
		.where(eq(memberships.id, membershipId));
};

/** Remembered on this device only, so the next launch opens the same household. */
export const setCurrentHousehold = (householdId: string) =>
	updateDeviceState({ current_household_id: householdId });
