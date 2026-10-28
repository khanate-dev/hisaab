import { useLingui } from "@lingui/react/macro";

import { useCurrentHousehold } from "@/features/households/use-current-household";
import { useMembership } from "@/features/households/use-membership";
import { setPreference } from "@/features/notifications/actions";
import { PreferencesList } from "@/features/notifications/preferences-list";
import { usePreferences } from "@/features/notifications/use-notifications";
import { Screen } from "@/features/shell/screen";
import { useSignedInUserId } from "@/lib/session";

export default function NotificationPreferences() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const household = useCurrentHousehold(userId);
	const membership = useMembership(household?.id, userId);
	const preferences = usePreferences(household?.id, userId);

	return (
		<Screen title={t`Notification preferences`}>
			{household && membership && preferences !== undefined && (
				<PreferencesList
					householdName={household.name}
					onChange={(trigger, enabled) =>
						void setPreference(household.id, userId, trigger, enabled)
					}
					preferences={preferences}
					role={membership.role}
					userId={userId}
				/>
			)}
		</Screen>
	);
}
