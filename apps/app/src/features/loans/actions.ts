import {
	contacts,
	entries,
	type LoanDirection,
	loans,
	stamped,
	stampedDelete,
} from "@hisaab/client-schema";
import { magnitude, negateMoney, parseMoney } from "@hisaab/domain";
import { eq } from "drizzle-orm";

import { nowIso } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { db } from "@/lib/powersync";

/** A new Loan as its form has it: who, which way, from or into which Wallet, how much and when. */
export type LoanDraft = {
	direction: LoanDirection;
	/** An existing Contact, or a new one's name. */
	contact: { id: string } | { name: string };
	walletId: string;
	/** How much, positive, in the Wallet's currency. */
	amount: string;
	occurredOn: string;
	dueOn: string | null;
	notes: string | null;
};

const PRINCIPAL = "loan_principal" as const;
const REPAYMENT = "repayment" as const;

/** A Loan's principal or a Repayment: signed by its effect on the Wallet, the way the Loan went. */
const signed = (
	direction: LoanDirection,
	kind: typeof PRINCIPAL | typeof REPAYMENT,
	amount: string,
	currency: string,
) => {
	const howMuch = magnitude(parseMoney(amount, currency));
	const leaves = (direction === "lent") === (kind === PRINCIPAL);
	return (leaves ? negateMoney(howMuch) : howMuch).toString();
};

/** The Loan, its principal Entry and, if new, its Contact, in one local transaction. */
export const createLoan = async (
	householdId: string,
	userId: string,
	draft: LoanDraft,
	currency: string,
) => {
	const loanId = newId();
	const createdAt = nowIso();
	await db.transaction(async (tx) => {
		const contactId = "id" in draft.contact ? draft.contact.id : newId();
		if ("name" in draft.contact) {
			await tx.insert(contacts).values(
				stamped({
					id: contactId,
					household_id: householdId,
					name: draft.contact.name.trim(),
					created_at: createdAt,
				}),
			);
		}
		await tx.insert(loans).values(
			stamped({
				id: loanId,
				household_id: householdId,
				contact_id: contactId,
				direction: draft.direction,
				due_on: draft.dueOn,
				notes: draft.notes,
				created_at: createdAt,
			}),
		);
		await tx.insert(entries).values(
			stamped({
				id: newId(),
				household_id: householdId,
				wallet_id: draft.walletId,
				kind: PRINCIPAL,
				amount: signed(draft.direction, PRINCIPAL, draft.amount, currency),
				loan_id: loanId,
				occurred_on: draft.occurredOn,
				created_by: userId,
				created_at: createdAt,
			}),
		);
	});
	return loanId;
};

/** A Repayment paying down part of a Loan, to or from any Wallet in its currency (CONTEXT.md). */
export const recordRepayment = async (
	householdId: string,
	userId: string,
	loan: { id: string; direction: LoanDirection },
	repayment: { walletId: string; amount: string; occurredOn: string },
	currency: string,
) => {
	await db.insert(entries).values(
		stamped({
			id: newId(),
			household_id: householdId,
			wallet_id: repayment.walletId,
			kind: REPAYMENT,
			amount: signed(loan.direction, REPAYMENT, repayment.amount, currency),
			loan_id: loan.id,
			occurred_on: repayment.occurredOn,
			created_by: userId,
			created_at: nowIso(),
		}),
	);
};

/** Settles a Loan by writing off what's left, or takes that back. */
export const setWrittenOff = async (loanId: string, writtenOff: boolean) => {
	await db
		.update(loans)
		.set(stamped({ written_off_at: writtenOff ? nowIso() : null }))
		.where(eq(loans.id, loanId));
};

/** The Loan goes with its principal and Repayments; they go first, so the server never meets a Loan still in use. */
export const deleteLoan = async (loanId: string) => {
	await db.transaction(async (tx) => {
		await tx
			.update(entries)
			.set(stampedDelete())
			.where(eq(entries.loan_id, loanId));
		await tx.update(loans).set(stampedDelete()).where(eq(loans.id, loanId));
	});
};
