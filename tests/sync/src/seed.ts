import { v7 as uuidv7 } from "uuid";

import { adminClient, signInNewUser } from "./users";

/**
 * A fixed adversarial seed: every Role in a shared household, a User in two shared households, and an outsider.
 * - Family: alice Admin, bob Member, carol Viewer
 * - Side: bob Admin
 * - dave belongs only to his Personal household
 */
export const seedHouseholds = async () => {
	const [alice, bob, carol, dave] = await Promise.all([
		signInNewUser(),
		signInNewUser(),
		signInNewUser(),
		signInNewUser(),
	]);
	const family = uuidv7();
	const side = uuidv7();

	const admin = adminClient();
	const households = await admin.from("households").insert([
		{ id: family, name: "Family" },
		{ id: side, name: "Side" },
	]);
	if (households.error) throw households.error;
	const memberships = await admin.from("memberships").insert([
		{ id: uuidv7(), household_id: family, user_id: alice.id, role: "admin" },
		{ id: uuidv7(), household_id: family, user_id: bob.id, role: "member" },
		{ id: uuidv7(), household_id: family, user_id: carol.id, role: "viewer" },
		{ id: uuidv7(), household_id: side, user_id: bob.id, role: "admin" },
	]);
	if (memberships.error) throw memberships.error;

	return { users: { alice, bob, carol, dave }, households: { family, side } };
};
