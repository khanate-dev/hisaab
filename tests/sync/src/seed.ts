import type { Role } from "@hisaab/client-schema";
import { occurrenceId, preferenceId, ruleFollowerId } from "@hisaab/domain";
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
		{ id: family, name: "Family", created_by: alice.id },
		{ id: side, name: "Side", created_by: bob.id },
		// Created by dave but never joined: RLS lets its founder read it, the streams send it nobody.
		{ id: uuidv7(), name: "Founding", created_by: dave.id },
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
	// bob starts his family Entries in its Cash Wallet.
	const familyWallet = await admin
		.from("wallets")
		.select("id")
		.eq("household_id", family)
		.single();
	if (familyWallet.error) throw familyWallet.error;
	const defaulted = await admin
		.from("memberships")
		.update({ default_wallet_id: familyWallet.data.id })
		.eq("household_id", family)
		.eq("user_id", bob.id);
	if (defaulted.error) throw defaulted.error;

	// bob moves money from Side to Family: mirrored halves (ADR-0003), each household with its own.
	const sideWallet = await admin
		.from("wallets")
		.select("id")
		.eq("household_id", side)
		.single();
	if (sideWallet.error) throw sideWallet.error;
	const link = uuidv7();
	const halves = await admin.from("entries").insert([
		{
			id: uuidv7(),
			household_id: side,
			wallet_id: sideWallet.data.id,
			kind: "household_transfer",
			amount: "-250",
			link_id: link,
			occurred_on: "2026-10-27",
			created_by: bob.id,
		},
		{
			id: uuidv7(),
			household_id: family,
			wallet_id: familyWallet.data.id,
			kind: "household_transfer",
			amount: "250",
			link_id: link,
			occurred_on: "2026-10-27",
			created_by: bob.id,
		},
	]);
	if (halves.error) throw halves.error;

	// Every User saves a filter at home, and everyone in Family saves one there: each sees only their own.
	const filters = await admin.from("saved_filters").insert([
		...personal.data.map((row) => ({
			id: uuidv7(),
			household_id: row.id,
			user_id: row.personal_user_id as string,
			name: "Mine",
			criteria: JSON.stringify({ query: ">2000" }),
		})),
		...[alice, bob, carol].map((user) => ({
			id: uuidv7(),
			household_id: family,
			user_id: user.id,
			name: "Family",
			criteria: JSON.stringify({ query: "rent" }),
		})),
	]);
	if (filters.error) throw filters.error;

	// Every User sets a preference at home. (Their Membership Notifications were raised as the joins happened.)
	const preferences = await admin.from("notification_preferences").insert(
		personal.data.map((row) => ({
			id: preferenceId(
				row.personal_user_id as string,
				row.id,
				"monthly_summary",
			),
			household_id: row.id,
			user_id: row.personal_user_id as string,
			trigger: "monthly_summary",
			enabled: true,
		})),
	);
	if (preferences.error) throw preferences.error;

	// Someone who deleted their account, as their Former member in Family (server-written only).
	const former = await admin
		.from("former_members")
		.insert({ id: uuidv7(), household_id: family, number: 1 });
	if (former.error) throw former.error;

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

	// A Budget for Groceries per household, overridden for one month.
	const budgets = await admin.from("budgets").insert(
		expenses.map(({ household_id, category_id }) => ({
			id: uuidv7(),
			household_id,
			category_id,
			valid_from: "2026-10",
			amount: "30000",
		})),
	);
	if (budgets.error) throw budgets.error;
	const overrides = await admin.from("budget_overrides").insert(
		expenses.map(({ household_id, category_id }) => ({
			id: uuidv7(),
			household_id,
			category_id,
			month: "2026-11",
			amount: "45000",
		})),
	);
	if (overrides.error) throw overrides.error;

	// A CSV import mapping for each household's Wallet, kept for its Admins.
	const mappings = await admin.from("import_mappings").insert(
		expenses.map(({ household_id, wallet_id }) => ({
			id: uuidv7(),
			household_id,
			wallet_id,
			mapping: JSON.stringify({ hasHeader: true, dateColumn: 0 }),
		})),
	);
	if (mappings.error) throw mappings.error;

	// An image attached to each household's Expense.
	const attachmentRows = await admin.from("attachments").insert(
		expenses.map(({ id, household_id, author }) => ({
			id: uuidv7(),
			household_id,
			entry_id: id,
			media_type: "image/jpeg",
			size_bytes: 1000,
			file_name: "receipt.jpg",
			created_by: author,
		})),
	);
	if (attachmentRows.error) throw attachmentRows.error;

	// A monthly Recurring rule for Groceries per household, with its first Occurrence snoozed.
	const rules = expenses.map(
		({ household_id, wallet_id, category_id, author }) => ({
			id: uuidv7(),
			household_id,
			wallet_id,
			category_id,
			created_by: author,
		}),
	);
	const ruleRows = await admin.from("recurring_rules").insert(
		rules.map((r) => ({
			...r,
			kind: "expense",
			amount: "5000",
			frequency: "monthly",
			day_of_month: 1,
			starts_on: "2026-10-01",
		})),
	);
	if (ruleRows.error) throw ruleRows.error;
	// Everyone in each household follows its rule ("Notify me"; #105).
	const members = await admin
		.from("memberships")
		.select("household_id, user_id")
		.in(
			"household_id",
			rules.map((r) => r.household_id),
		);
	if (members.error) throw members.error;
	const follows = await admin.from("recurring_rule_followers").insert(
		members.data.flatMap(({ household_id, user_id }) =>
			rules
				.filter((r) => r.household_id === household_id)
				.map((r) => ({
					id: ruleFollowerId(r.id, user_id),
					household_id,
					rule_id: r.id,
					user_id,
					enabled: true,
				})),
		),
	);
	if (follows.error) throw follows.error;
	const occurrenceRows = await admin.from("occurrences").insert(
		rules.map(({ id, household_id }) => ({
			id: occurrenceId(id, "2026-10-01"),
			household_id,
			rule_id: id,
			due_on: "2026-10-01",
			state: "snoozed",
			snoozed_until: "2026-10-05",
		})),
	);
	if (occurrenceRows.error) throw occurrenceRows.error;

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

	// An open Invite per household, from the User who wrote its rows (its Admin).
	const invites = await admin.from("invites").insert(
		wallets.map(({ household_id, author }) => ({
			id: uuidv7(),
			household_id,
			token: uuidv7().replaceAll("-", ""),
			role: "member",
			expires_at: new Date(Date.now() + 86_400_000).toISOString(),
			created_by: author,
		})),
	);
	if (invites.error) throw invites.error;
};
