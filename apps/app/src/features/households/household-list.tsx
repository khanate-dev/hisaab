import type { Role } from "@hisaab/client-schema";
import { View } from "react-native";

import { Text } from "@/components/ui/text";

import type { HouseholdSummary } from "./use-households";

const ROLE_LABELS: Record<Role, string> = {
	admin: "Admin",
	member: "Member",
	viewer: "Viewer",
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
	if (households.length === 0) {
		return (
			<Text
				role="status"
				variant="muted"
			>
				Syncing your households…
			</Text>
		);
	}

	return (
		<View
			className="gap-3"
			role="list"
		>
			{ordered(households).map((household) => (
				<View
					accessible
					className="rounded-card border-3 border-border bg-surface p-4"
					key={household.id}
					role="listitem"
				>
					<Text variant="title">
						{household.isPersonal ? "Personal" : household.name}
					</Text>
					{!household.isPersonal && (
						<Text variant="muted">{ROLE_LABELS[household.role]}</Text>
					)}
				</View>
			))}
		</View>
	);
};
