import { useLingui } from "@lingui/react/macro";

import { PrivacyPolicy } from "@/features/legal/privacy-policy";
import { Screen } from "@/features/shell/screen";

/** Open signed in or out: the stores link here. */
export default function PrivacyScreen() {
	const { t } = useLingui();
	return (
		<Screen title={t`Privacy policy`}>
			<PrivacyPolicy />
		</Screen>
	);
}
