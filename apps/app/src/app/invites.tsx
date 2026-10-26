import { useLingui } from "@lingui/react/macro";
import { Redirect } from "expo-router";

import { Text } from "@/components/ui/text";
import { useCurrentHousehold } from "@/features/households/use-current-household";
import { useMembership } from "@/features/households/use-membership";
import { createInvite, revokeInvite } from "@/features/invites/actions";
import { InviteForm } from "@/features/invites/invite-form";
import { inviteLink } from "@/features/invites/invite-link";
import { InviteList } from "@/features/invites/invite-list";
import { useInvites } from "@/features/invites/use-invites";
import { Screen } from "@/features/shell/screen";
import { useSignedInUserId } from "@/lib/session";

/** Invites to the household on screen; Admins only (spec §3.1). */
export default function Invites() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const household = useCurrentHousehold(userId);
	const membership = useMembership(household?.id, userId);
	const invites = useInvites(household?.id);
	if (membership === null || membership?.role !== "admin") {
		if (membership !== undefined) return <Redirect href="/household" />;
		return null;
	}
	if (!household || !invites) return null;

	return (
		<Screen title={t`Invites`}>
			<Text variant="muted">{t`Share a link to let someone join with the Role you pick. Links stop working when they expire or you revoke them.`}</Text>
			<InviteForm
				onSubmit={(draft) =>
					createInvite(household.id, userId, draft).then(() => {})
				}
			/>
			<Text variant="title">{t`Invites`}</Text>
			<InviteList
				invites={invites}
				linkFor={inviteLink}
				now={new Date()}
				onRevoke={(id) => void revokeInvite(id)}
			/>
		</Screen>
	);
}
