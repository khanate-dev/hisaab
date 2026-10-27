import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

import { useCategories } from "@/features/categories/use-categories";
import { useCanWrite } from "@/features/households/use-can-write";
import { useCurrentHousehold } from "@/features/households/use-current-household";
import {
	confirmOccurrences,
	skipOccurrence,
	snoozeOccurrence,
} from "@/features/recurring/actions";
import { PendingList } from "@/features/recurring/pending-list";
import { useDueOccurrences } from "@/features/recurring/use-recurring";
import { Screen } from "@/features/shell/screen";
import { entryTimeZone, todayIn } from "@/lib/dates";
import { useSignedInUserId } from "@/lib/session";

export default function Pending() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const household = useCurrentHousehold(userId);
	const canWrite = useCanWrite(household?.id, userId) === true;
	const today = todayIn(entryTimeZone(household));
	const due = useDueOccurrences(household?.id, today);
	const categories = useCategories(household?.id);
	const names = useMemo(
		() => new Map((categories ?? []).map((c) => [c.id, c.name])),
		[categories],
	);
	const currency = household?.base_currency;

	return (
		<Screen title={t`Pending`}>
			{currency && due && (
				<PendingList
					baseCurrency={currency}
					canEdit={canWrite}
					categoryNames={names}
					onConfirm={(confirmations) =>
						confirmOccurrences(userId, confirmations, currency)
					}
					onSkip={skipOccurrence}
					onSnooze={snoozeOccurrence}
					pending={due.pending}
					today={today}
				/>
			)}
		</Screen>
	);
}
