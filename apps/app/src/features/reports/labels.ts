import type { ReportPreset } from "@hisaab/domain";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";

export const PRESET_LABELS: Record<ReportPreset, MessageDescriptor> = {
	this_month: msg`This month`,
	last_month: msg`Last month`,
	last_3_months: msg`Last 3 months`,
	last_6_months: msg`Last 6 months`,
	last_12_months: msg`Last 12 months`,
};

/** What a report's figures are compared with (spec §3.5). */
const PREVIOUS = "previous" as const;
const AVERAGE = "average" as const;
export const COMPARISONS = [PREVIOUS, AVERAGE] as const;
export type Comparison = (typeof COMPARISONS)[number];

export const COMPARISON_LABELS: Record<Comparison, MessageDescriptor> = {
	previous: msg`vs the previous period`,
	average: msg`vs the 3-month average`,
};
