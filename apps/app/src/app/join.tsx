import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";

import { JoinWithLinkForm } from "@/features/invites/join-with-link-form";
import { Screen } from "@/features/shell/screen";

export default function JoinWithLink() {
	const { t } = useLingui();
	return (
		<Screen title={t`Join with link`}>
			<JoinWithLinkForm onOpen={(token) => router.push(`/invite/${token}`)} />
		</Screen>
	);
}
