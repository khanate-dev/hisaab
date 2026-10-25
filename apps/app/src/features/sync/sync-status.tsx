import type { uploadErrors } from "@hisaab/client-schema";
import { Button, StyleSheet, Text, View } from "react-native";

export type Rejection = typeof uploadErrors.$inferSelect;

const TABLE_LABELS: Record<string, string> = {
	households: "household",
	memberships: "membership",
};

const describeChange = ({ op, table_name }: Rejection) => {
	const thing = TABLE_LABELS[table_name] ?? table_name;
	if (op === "PUT") return `New ${thing}`;
	if (op === "DELETE") return `Deleting a ${thing}`;
	return `Change to a ${thing}`;
};

const describeReason = ({ code, message }: Rejection) => {
	if (code === "no_rows") return "No permission, or someone else deleted it.";
	if (code === "42501") return "No permission.";
	return message;
};

type Props = {
	connected: boolean;
	/** Writes the server rejected ("couldn't sync" items, ADR-0007). */
	rejections: Rejection[];
	onDismiss: (id: string) => void;
};

/** The Sync status sheet: whether the device is online, and every change that couldn't sync. */
export const SyncStatus = ({ connected, rejections, onDismiss }: Props) => (
	<View style={styles.sheet}>
		<Text role="status">
			{connected ? "Online." : "Offline. Changes sync when you're back online."}
			{rejections.length === 0 && " Every change synced."}
		</Text>
		{rejections.length > 0 && (
			<View
				role="list"
				style={styles.list}
			>
				{rejections.map((rejection) => (
					<View
						key={rejection.id}
						role="listitem"
						style={styles.item}
					>
						<Text style={styles.change}>
							{describeChange(rejection)} couldn't sync
						</Text>
						<Text>{describeReason(rejection)}</Text>
						<Button
							accessibilityLabel={`Dismiss: ${describeChange(rejection)}`}
							onPress={() => onDismiss(rejection.id)}
							title="Dismiss"
						/>
					</View>
				))}
			</View>
		)}
	</View>
);

const styles = StyleSheet.create({
	sheet: { gap: 16, padding: 24 },
	list: { gap: 8 },
	item: { borderWidth: 1, gap: 4, padding: 12 },
	change: { fontWeight: "bold" },
});
