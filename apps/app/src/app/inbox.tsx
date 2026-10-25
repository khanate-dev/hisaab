import { useLingui } from "@lingui/react/macro";

import { Text } from "@/components/ui/text";
import { Screen } from "@/features/shell/screen";

export default function Inbox() {
	const { t } = useLingui();
	return (
		<Screen title={t`Notifications`}>
			<Text variant="muted">{t`No notifications yet.`}</Text>
		</Screen>
	);
}
