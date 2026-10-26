import type { LoanDirection } from "@hisaab/client-schema";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export const LOAN_DIRECTION_LABELS: Record<LoanDirection, MessageDescriptor> = {
	lent: msg`Lent`,
	borrowed: msg`Borrowed`,
};
