import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { RecurringFrequency, RecurringMode } from "@hisaab/client-schema";

export const MODE_LABELS: Record<RecurringMode, MessageDescriptor> = {
	confirm: msg`Confirm each one`,
	auto: msg`Auto-record`,
};

export const FREQUENCY_LABELS: Record<RecurringFrequency, MessageDescriptor> = {
	monthly: msg`Monthly`,
	weekly: msg`Weekly`,
	yearly: msg`Yearly`,
};
