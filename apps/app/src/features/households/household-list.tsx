import type { Role } from "@hisaab/client-schema";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";

import type { HouseholdSummary } from "./use-households";

const ROLE_LABELS: Record<Role, MessageDescriptor> = {
	admin: msg`Admin`,
	member: msg`Member`,
	viewer: msg`Viewer`,
};

/** The Personal household comes first, presented as "Personal"; shared households follow by name. */
const ordered = (households: HouseholdSummary[]) =>
	households.toSorted(
		(a, b) =>
			Number(b.isPersonal) - Number(a.isPersonal) ||
			a.name.localeCompare(b.name),
	);

export const HouseholdList = ({
	households,
}: {
	households: HouseholdSummary[];
}) => {
	const { t, i18n } = useLingui();
	if (households.length === 0) {
		return (
			<Text
				role="status"
				variant="muted"
			>
				<Trans>Syncing your households…</Trans>
			</Text>
		);
	}

	return (
		<View
			className="gap-3"
			role="list"
		>
			{ordered(households).map((household) => (
				<Card
					accessible
					key={household.id}
					role="listitem"
				>
					<Text variant="title">
						{household.isPersonal ? t`Personal` : household.name}
					</Text>
					{!household.isPersonal && (
						<Text variant="muted">{i18n._(ROLE_LABELS[household.role])}</Text>
					)}
				</Card>
			))}
		</View>
	);
};
