import { useLingui } from "@lingui/react/macro";

import { useCurrentHousehold } from "@/features/households/use-current-household";
import { useMembership } from "@/features/households/use-membership";
import { setPreference } from "@/features/notifications/actions";
import { PreferencesList } from "@/features/notifications/preferences-list";
import { ThisDevicePush } from "@/features/notifications/this-device-push";
import { usePreferences } from "@/features/notifications/use-notifications";
import { Screen } from "@/features/shell/screen";
import { useSignedInUserId } from "@/lib/session";

const HouseholdPreferences = ({
	household,
	userId,
}: {
	household: { id: string; name: string };
	userId: string;
}) => {
	const membership = useMembership(household.id, userId);
	const choices = usePreferences(household.id, userId);
	if (!membership || choices === undefined) return null;
	return (
		<PreferencesList
			choices={choices}
			householdName={household.name}
			onChange={(trigger, enabled) =>
				void setPreference(
					{ householdId: household.id, userId },
					trigger,
					enabled,
				)
			}
			role={membership.role}
		/>
	);
};

export default function NotificationPreferences() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const household = useCurrentHousehold(userId);
	return (
		<Screen title={t`Notification preferences`}>
			<ThisDevicePush userId={userId} />
			{household && (
				<HouseholdPreferences
					household={household}
					key={household.id}
					userId={userId}
				/>
			)}
		</Screen>
	);
}
