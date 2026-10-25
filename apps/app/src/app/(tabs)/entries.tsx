import { useLingui } from "@lingui/react/macro";

import { Text } from "@/components/ui/text";
import { Screen } from "@/features/shell/screen";

export default function Entries() {
	const { t } = useLingui();
	return (
		<Screen title={t`Entries`}>
			<Text variant="muted">{t`Every Entry, searchable, arrives with recording Entries.`}</Text>
		</Screen>
	);
}
