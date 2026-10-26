import { useLingui } from "@lingui/react/macro";

import { Text } from "@/components/ui/text";

/** Shown instead of an Entry form while the household has no Wallet to record in. */
export const NeedsWallet = () => {
	const { t } = useLingui();
	return (
		<Text
			role="status"
			variant="muted"
		>
			{t`Add a Wallet first: every Entry comes out of or goes into one.`}
		</Text>
	);
};
