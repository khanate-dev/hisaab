import { Trans, useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";

import { ROLE_LABELS } from "./labels";
import type { HouseholdSummary } from "./use-households";

/** The Personal household comes first, presented as "Personal"; shared households follow by name. */
const ordered = (households: HouseholdSummary[]) =>
	households.toSorted(
		(a, b) =>
			Number(b.isPersonal) - Number(a.isPersonal) ||
			a.name.localeCompare(b.name),
	);

type Props = {
	households: HouseholdSummary[];
	/** The household on screen. */
	currentId: string | undefined;
	/** Switches to a household. */
	onPick: (householdId: string) => void;
};

/** The switcher sheet's households, each with the User's Role there; picking one switches to it. */
export const HouseholdList = ({ households, currentId, onPick }: Props) => {
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
			{ordered(households).map((household) => {
				const name = household.isPersonal ? t`Personal` : household.name;
				const role = i18n._(ROLE_LABELS[household.role]);
				const current = household.id === currentId;
				return (
					<View
						key={household.id}
						role="listitem"
					>
						<Card
							accessibilityLabel={
								household.isPersonal ? name : t`${name}, ${role}`
							}
							accessibilityState={{ selected: current }}
							onPress={() => onPick(household.id)}
						>
							<Text variant="title">{name}</Text>
							{!household.isPersonal && <Text variant="muted">{role}</Text>}
							{current && <Text variant="muted">{t`On screen now`}</Text>}
						</Card>
					</View>
				);
			})}
		</View>
	);
};
