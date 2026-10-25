import { useLingui } from "@lingui/react/macro";

import { Text } from "@/components/ui/text";
import { Screen } from "@/features/shell/screen";

export default function Home() {
	const { t } = useLingui();
	return (
		<Screen title={t`Home`}>
			<Text variant="muted">{t`Your balance, spending and budgets arrive with your first Wallet.`}</Text>
		</Screen>
	);
}
