import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";

import { Text } from "@/components/ui/text";

/** Entries in another currency without a Base amount yet: counted in no report until a rate arrives (ADR-0005). */
export const UnpricedNote = ({ count }: { count: number }) => {
	const { t } = useLingui();
	if (count === 0) return null;
	return (
		<Text variant="muted">
			{t`${plural(count, { one: "# Entry in another currency isn't", other: "# Entries in other currencies aren't" })} counted yet: no exchange rate is held for ${plural(count, { one: "its date", other: "their dates" })}.`}
		</Text>
	);
};
