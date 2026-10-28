import { useLingui } from "@lingui/react/macro";

import { SupportInfo } from "@/features/legal/support-info";
import { Screen } from "@/features/shell/screen";

/** Open signed in or out: the stores link here. */
export default function SupportScreen() {
	const { t } = useLingui();
	return (
		<Screen title={t`Support`}>
			<SupportInfo />
		</Screen>
	);
}
