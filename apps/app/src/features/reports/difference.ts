import {
	addMoney,
	isNegative,
	isZero,
	type Money,
	negateMoney,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";

import { formatMoney } from "@/lib/format";

/** How a figure stands against what it's compared with, in words: "PKR 200 more", "PKR 50 less", "The same". */
export const useDifference = () => {
	const { t } = useLingui();
	return (now: Money, then: Money) => {
		const gap = addMoney(now, negateMoney(then));
		if (isZero(gap)) return t`The same`;
		const amount = formatMoney(isNegative(gap) ? negateMoney(gap) : gap);
		return isNegative(gap) ? t`${amount} less` : t`${amount} more`;
	};
};
