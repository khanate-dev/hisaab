import { StyleSheet, Text, View } from "react-native";

export type Role = "admin" | "member" | "viewer";

export type HouseholdSummary = {
	id: string;
	name: string;
	isPersonal: boolean;
	/** The signed-in User's Role in the household. */
	role: Role;
};

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
	if (households.length === 0) return <Text>Syncing your households…</Text>;

	return (
		<View
			role="list"
			style={styles.list}
		>
			{ordered(households).map((household) => (
				<View
					accessible
					key={household.id}
					role="listitem"
					style={styles.item}
				>
					<Text style={styles.name}>
						{household.isPersonal ? "Personal" : household.name}
					</Text>
					{!household.isPersonal && <Text>{ROLE_LABELS[household.role]}</Text>}
				</View>
			))}
		</View>
	);
};

const styles = StyleSheet.create({
	list: { gap: 8 },
	item: { borderWidth: 1, gap: 4, padding: 12 },
	name: { fontWeight: "bold" },
});
