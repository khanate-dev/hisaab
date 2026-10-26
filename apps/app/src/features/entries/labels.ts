import type { EntryKind } from "@hisaab/client-schema";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";

const ENTRY_KIND_LABELS: Record<EntryKind, MessageDescriptor> = {
	balance_adjustment: msg`Balance adjustment`,
	expense: msg`Expense`,
	income: msg`Income`,
	transfer: msg`Transfer`,
	loan_principal: msg`Loan`,
	repayment: msg`Repayment`,
};

/** What an Entry's kind is called; a kind from a newer build is just an Entry. */
export const entryKindLabel = (kind: string): MessageDescriptor =>
	Object.hasOwn(ENTRY_KIND_LABELS, kind)
		? ENTRY_KIND_LABELS[kind as EntryKind]
		: msg`Entry`;

/** How Items are named: with their quantity ("Milk × 2 litres"), and the Rest as "Other <category>". */
export const useItemNames = () => {
	const { t } = useLingui();
	return {
		item: (description: string, quantity: string | null) =>
			quantity === null ? description : t`${description} × ${quantity}`,
		rest: (categoryName: string | undefined) =>
			categoryName === undefined ? t`Rest` : t`Other ${categoryName}`,
	};
};
