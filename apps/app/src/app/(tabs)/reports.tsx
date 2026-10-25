import { useLingui } from "@lingui/react/macro";

import { Text } from "@/components/ui/text";
import { Screen } from "@/features/shell/screen";

export default function Reports() {
	const { t } = useLingui();
	return (
		<Screen title={t`Reports`}>
			<Text variant="muted">{t`Reports arrive once there are Entries to report on.`}</Text>
		</Screen>
	);
}
