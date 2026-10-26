import { entries, loans } from "@hisaab/client-schema";
import {
	isSettled,
	loanOutstanding,
	magnitude,
	type Money,
	newestFirst,
	parseMoney,
} from "@hisaab/domain";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { and, eq, isNotNull } from "drizzle-orm";
import { useMemo } from "react";

import type { Contact } from "@/features/contacts/use-contacts";
import { useContacts } from "@/features/contacts/use-contacts";
import type { Entry } from "@/features/entries/types";
import { useWalletRows } from "@/features/wallets/use-wallets";
import { db } from "@/lib/powersync";
import { whenLoaded } from "@/lib/watched";

export type Loan = typeof loans.$inferSelect;

/** A Loan with what it's derived from: its Contact, principal, Repayments, currency, and what's outstanding. */
export type LoanView = {
	loan: Loan;
	contact: Contact | undefined;
	principal: Entry;
	/** How much was Lent or Borrowed, positive. */
	principalAmount: Money;
	/** Newest first. */
	repayments: Entry[];
	/** The principal's Wallet's currency; Repayments are in it too. */
	currency: string;
	outstanding: Money;
	settled: boolean;
};

/** The household's Loans, outstanding ones first; undefined until everything they need has loaded. */
export const useLoans = (
	householdId: string | undefined,
): LoanView[] | undefined => {
	const id = householdId ?? "";
	const loanRows = whenLoaded(
		useQuery(
			toCompilableQuery(
				db.select().from(loans).where(eq(loans.household_id, id)),
			),
		),
		householdId !== undefined,
	);
	const loanEntries = whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select()
					.from(entries)
					.where(and(eq(entries.household_id, id), isNotNull(entries.loan_id))),
			),
		),
		householdId !== undefined,
	);
	const contacts = useContacts(householdId);
	const wallets = useWalletRows(householdId);

	return useMemo(() => {
		if (!loanRows || !loanEntries || !contacts || !wallets) return undefined;
		const views = loanRows.flatMap((loan): LoanView[] => {
			const own = loanEntries.filter((entry) => entry.loan_id === loan.id);
			const principal = own.find((entry) => entry.kind === "loan_principal");
			const currency = wallets.find(
				(w) => w.id === principal?.wallet_id,
			)?.currency;
			// A Loan whose principal hasn't synced yet waits for it.
			if (!principal || !currency) return [];
			const outstanding = loanOutstanding(loan.direction, currency, own);
			return [
				{
					loan,
					contact: contacts.find((c) => c.id === loan.contact_id),
					principal,
					principalAmount: magnitude(parseMoney(principal.amount, currency)),
					repayments: own
						.filter((entry) => entry.kind === "repayment")
						.toSorted(newestFirst),
					currency,
					outstanding,
					settled: isSettled(outstanding, loan.written_off_at !== null),
				},
			];
		});
		return views.toSorted(
			(a, b) =>
				Number(a.settled) - Number(b.settled) ||
				b.loan.created_at.localeCompare(a.loan.created_at),
		);
	}, [loanRows, loanEntries, contacts, wallets]);
};
