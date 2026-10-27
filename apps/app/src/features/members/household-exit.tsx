import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Confirm } from "@/components/ui/confirm";
import { Text } from "@/components/ui/text";

type Props = {
	householdName: string;
	isAdmin: boolean;
	/** The household's last Admin can't leave until someone else is one. */
	lastAdmin: boolean;
	onLeave: () => void;
	onDelete: () => void;
};

/** Leaving a shared household, and, for an Admin, deleting it with everything in it (spec §3.1). */
export const HouseholdExit = ({
	householdName,
	isAdmin,
	lastAdmin,
	onLeave,
	onDelete,
}: Props) => {
	const { t } = useLingui();
	return (
		<View className="gap-3">
			{lastAdmin && (
				<Text variant="muted">{t`You're its only Admin: make someone else an Admin before you leave.`}</Text>
			)}
			<Confirm
				action={t`Leave`}
				description={t`It goes from your devices. What you recorded stays, and you can only come back by Invite.`}
				disabled={lastAdmin}
				onConfirm={onLeave}
				title={t`Leave ${householdName}?`}
				trigger={t`Leave household`}
			/>
			{isAdmin && (
				<Confirm
					action={t`Delete for everyone`}
					description={t`Every Wallet, Entry, Loan and Category in it goes, and its Activity log, for every Member. This can't be undone.`}
					onConfirm={onDelete}
					title={t`Delete ${householdName}?`}
					trigger={t`Delete household`}
					typed={{ label: t`Type its name to confirm`, text: householdName }}
				/>
			)}
		</View>
	);
};
