import { useLingui } from "@lingui/react/macro";

import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";

/** Home's Pending card: shown only while Occurrences wait for a confirm; it opens the Pending list. */
export const PendingTile = ({
	count,
	onOpen,
}: {
	count: number;
	onOpen: () => void;
}) => {
	const { t } = useLingui();
	if (count === 0) return null;
	return (
		<Card
			accessibilityHint={t`Opens what's Pending`}
			onPress={onOpen}
		>
			<Text variant="title">{t`Pending`}</Text>
			<Text variant="label">
				{count === 1
					? t`1 recurring Entry waits for you to confirm it.`
					: t`${count} recurring Entries wait for you to confirm them.`}
			</Text>
		</Card>
	);
};
