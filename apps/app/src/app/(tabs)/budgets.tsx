import { useLingui } from "@lingui/react/macro";

import { Text } from "@/components/ui/text";
import { Screen } from "@/features/shell/screen";

export default function Budgets() {
	const { t } = useLingui();
	return (
		<Screen title={t`Budgets`}>
			<Text variant="muted">{t`Budget months and Pace arrive with Budgets.`}</Text>
		</Screen>
	);
}
