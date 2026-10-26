import { invites, stamped } from "@hisaab/client-schema";
import {
	encodeInviteToken,
	INVITE_TOKEN_BYTES,
	type InviteLifetime,
	inviteExpiry,
	normalizeEmail,
	type Role,
} from "@hisaab/domain";
import { eq } from "drizzle-orm";
import { getRandomBytes } from "expo-crypto";

import { nowIso } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { db } from "@/lib/powersync";

export type InviteDraft = {
	role: Role;
	/** Only someone signed in with it may accept; null for anyone with the link. */
	email: string | null;
	lifetime: InviteLifetime;
};

/** An Admin's Invite: a fresh secret token, the Role it gives, and when it stops working. */
export const createInvite = async (
	householdId: string,
	userId: string,
	draft: InviteDraft,
) => {
	const createdAt = nowIso();
	const token = encodeInviteToken(getRandomBytes(INVITE_TOKEN_BYTES));
	await db.insert(invites).values(
		stamped({
			id: newId(),
			household_id: householdId,
			token,
			role: draft.role,
			email: draft.email === null ? null : normalizeEmail(draft.email),
			expires_at: inviteExpiry(
				new Date(createdAt),
				draft.lifetime,
			).toISOString(),
			revoked_at: null,
			accepted_by: null,
			accepted_at: null,
			created_by: userId,
			created_at: createdAt,
		}),
	);
	return token;
};

/** For good: a revoked Invite's link stops working. */
export const revokeInvite = async (inviteId: string) => {
	await db
		.update(invites)
		.set(stamped({ revoked_at: nowIso() }))
		.where(eq(invites.id, inviteId));
};
