import type { Role } from "@hisaab/client-schema";
import { v7 as uuidv7 } from "uuid";

import { adminClient, type SignedInUser, signInNewUser } from "./users";

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

	// Every User gets a name and a Personal Wallet with an opening Balance adjustment; each shared household one too.
	const users = { alice, bob, carol, dave };
	const personal = await admin
		.from("households")
		.select("id, personal_user_id")
		.in(
			"personal_user_id",
			Object.values(users).map((user) => user.id),
		);
	if (personal.error) throw personal.error;
	const profiles = await admin.from("profiles").insert(
		Object.entries(users).map(([name, user]) => ({
			id: user.id,
			display_name: name,
		})),
	);
	if (profiles.error) throw profiles.error;
	await seedWallets([
		...personal.data.map((row) => ({
			household: row.id,
			author: row.personal_user_id as string,
		})),
		{ household: family, author: alice.id },
		{ household: side, author: bob.id },
	]);

	return { users, households: { family, side } };
};

/** A fresh shared household with one new User per entry, in the given Role. */
export const seedHousehold = async <Name extends string>(
	roles: Record<Name, Role>,
) => {
	const names = Object.keys(roles) as Name[];
	const signedIn = await Promise.all(names.map(() => signInNewUser()));
	const users = Object.fromEntries(
		names.map((name, i) => [name, signedIn[i]]),
	) as Record<Name, SignedInUser>;
	const household = uuidv7();

	const admin = adminClient();
	const inserted = await admin
		.from("households")
		.insert({ id: household, name: "Family" });
	if (inserted.error) throw inserted.error;
	const memberships = await admin.from("memberships").insert(
		names.map((name) => ({
			id: uuidv7(),
			household_id: household,
			user_id: users[name].id,
			role: roles[name],
		})),
	);
	if (memberships.error) throw memberships.error;

	return { users, household };
};

/** A Cash Wallet with an opening Balance adjustment in each household. */
const seedWallets = async (
	households: { household: string; author: string }[],
) => {
	const admin = adminClient();
	const wallets = households.map(({ household, author }) => ({
		id: uuidv7(),
		household_id: household,
		author,
	}));
	const inserted = await admin.from("wallets").insert(
		wallets.map(({ id, household_id }) => ({
			id,
			household_id,
			name: "Cash",
			type: "cash",
			currency: "PKR",
		})),
	);
	if (inserted.error) throw inserted.error;
	const entries = await admin.from("entries").insert(
		wallets.map(({ id, household_id, author }) => ({
			id: uuidv7(),
			household_id,
			wallet_id: id,
			kind: "balance_adjustment",
			amount: "1000.50",
			occurred_on: "2026-10-26",
			created_by: author,
		})),
	);
	if (entries.error) throw entries.error;

	// An itemized Expense per household, in its template Groceries Category.
	const groceries = await admin
		.from("categories")
		.select("id, household_id")
		.eq("name", "Groceries")
		.in(
			"household_id",
			wallets.map((w) => w.household_id),
		);
	if (groceries.error) throw groceries.error;
	const expenses = wallets.map(({ id, household_id, author }) => ({
		id: uuidv7(),
		household_id,
		wallet_id: id,
		category_id:
			groceries.data.find((c) => c.household_id === household_id)?.id ?? null,
		author,
	}));
	const expenseRows = await admin.from("entries").insert(
		expenses.map(({ id, household_id, wallet_id, category_id, author }) => ({
			id,
			household_id,
			wallet_id,
			kind: "expense",
			amount: "-450",
			category_id,
			occurred_on: "2026-10-26",
			created_by: author,
		})),
	);
	if (expenseRows.error) throw expenseRows.error;
	const items = await admin.from("entry_items").insert(
		expenses.map(({ id, household_id, category_id }) => ({
			id: uuidv7(),
			household_id,
			entry_id: id,
			position: 0,
			description: "Milk",
			amount: "450",
			category_id,
		})),
	);
	if (items.error) throw items.error;

	// A Loan Lent to a Contact per household, with its principal.
	const contacts = wallets.map(({ household_id }) => ({
		id: uuidv7(),
		household_id,
	}));
	const contactRows = await admin
		.from("contacts")
		.insert(contacts.map((c) => ({ ...c, name: "Ali" })));
	if (contactRows.error) throw contactRows.error;
	const loans = contacts.map(({ id, household_id }) => ({
		id: uuidv7(),
		household_id,
		contact_id: id,
	}));
	const loanRows = await admin
		.from("loans")
		.insert(loans.map((l) => ({ ...l, direction: "lent" })));
	if (loanRows.error) throw loanRows.error;
	const principals = await admin.from("entries").insert(
		loans.map(({ id, household_id }) => {
			const wallet = wallets.find((w) => w.household_id === household_id);
			return {
				id: uuidv7(),
				household_id,
				wallet_id: wallet?.id,
				kind: "loan_principal",
				amount: "-1000",
				loan_id: id,
				occurred_on: "2026-10-26",
				created_by: wallet?.author,
			};
		}),
	);
	if (principals.error) throw principals.error;
};
