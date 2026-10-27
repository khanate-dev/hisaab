import { useLingui } from "@lingui/react/macro";

import { useCurrentHousehold } from "@/features/households/use-current-household";
import { useMembership } from "@/features/households/use-membership";
import { changeRole, removeMembership } from "@/features/members/actions";
import { MemberList } from "@/features/members/member-list";
import { useMembers } from "@/features/members/use-members";
import { Screen } from "@/features/shell/screen";
import { useSignedInUserId } from "@/lib/session";

export default function Members() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const household = useCurrentHousehold(userId);
	const membership = useMembership(household?.id, userId);
	const members = useMembers(household?.id);
	if (!household || !membership || !members) return null;

	return (
		<Screen title={t`Members & Roles`}>
			<MemberList
				isAdmin={membership.role === "admin"}
				members={members}
				onChangeRole={(id, role) => void changeRole(id, role)}
				onRemove={(id) => void removeMembership(id)}
				userId={userId}
			/>
		</Screen>
	);
}
