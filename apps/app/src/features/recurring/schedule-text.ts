import { useLingui } from "@lingui/react/macro";

import type { RecurringRule } from "./types";

/** How often a rule falls due, in words: "Monthly on day 5", "Every 2 weeks", "Yearly". */
export const useScheduleText = () => {
	const { t } = useLingui();
	return ({
		frequency,
		interval,
		day_of_month: day,
	}: Pick<RecurringRule, "frequency" | "interval" | "day_of_month">) => {
		switch (frequency) {
			case "monthly":
				return interval === 1
					? t`Monthly on day ${day}`
					: t`Every ${interval} months on day ${day}`;
			case "weekly":
				return interval === 1 ? t`Weekly` : t`Every ${interval} weeks`;
			case "yearly":
				return interval === 1 ? t`Yearly` : t`Every ${interval} years`;
		}
	};
};
