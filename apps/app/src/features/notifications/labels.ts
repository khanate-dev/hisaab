import type { NotificationTrigger } from "@hisaab/domain";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export const TRIGGER_LABELS: Record<NotificationTrigger, MessageDescriptor> = {
	recurring_due: msg`Recurring due`,
	auto_recorded: msg`Auto-recorded`,
	budget_threshold: msg`Budget threshold`,
	loan_due: msg`Loan due`,
	household_activity: msg`Household activity`,
	membership: msg`Membership`,
	monthly_summary: msg`Monthly summary`,
};

export const TRIGGER_HINTS: Record<NotificationTrigger, MessageDescriptor> = {
	recurring_due: msg`A recurring Entry waits for you to confirm it.`,
	auto_recorded: msg`A Recurring rule recorded an Entry.`,
	budget_threshold: msg`A Budget passes 80%, then 100%.`,
	loan_due: msg`A Loan is nearly due, due, or overdue.`,
	household_activity: msg`A daily digest of what others changed.`,
	membership: msg`Someone joins, leaves, or changes Role.`,
	monthly_summary: msg`How the last Budget month went.`,
};
