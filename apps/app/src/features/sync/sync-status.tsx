import { NO_ROWS, UNMAPPABLE, type uploadErrors } from "@hisaab/client-schema";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

/** A local change the server rejected (CONTEXT.md: Rejected change). */
export type RejectedChange = typeof uploadErrors.$inferSelect;

const TABLE_LABELS: Record<string, string> = {
	households: "household",
	memberships: "membership",
};

const describeChange = ({ op, table_name }: RejectedChange) => {
	const thing = TABLE_LABELS[table_name] ?? table_name;
	if (op === "PUT") return `New ${thing}`;
	if (op === "DELETE") return `Deleting a ${thing}`;
	return `Change to a ${thing}`;
};

const describeReason = ({ code, message }: RejectedChange) => {
	if (code === NO_ROWS) return "No permission, or someone else deleted it.";
	if (code === "42501") return "No permission.";
	if (code === UNMAPPABLE)
		return "Made by an older version of the app, and it no longer fits.";
	return message;
};

type Props = {
	connected: boolean;
	/** Shown as "couldn't sync" items (ADR-0007). */
	rejectedChanges: RejectedChange[];
	onDismiss: (id: string) => void;
};

/** The Sync status sheet's body: whether the device is online, and every change that couldn't sync. */
export const SyncStatus = ({
	connected,
	rejectedChanges,
	onDismiss,
}: Props) => (
	<View className="gap-4">
		<Text role="status">
			{connected ? "Online." : "Offline. Changes sync when you're back online."}
			{rejectedChanges.length === 0 && " Every change synced."}
		</Text>
		{rejectedChanges.length > 0 && (
			<View
				className="gap-3"
				role="list"
			>
				{rejectedChanges.map((change) => (
					<View
						className="gap-2 rounded-card border-3 border-border bg-surface-2 p-3"
						key={change.id}
						role="listitem"
					>
						<Text variant="label">{describeChange(change)} couldn't sync</Text>
						<Text variant="muted">{describeReason(change)}</Text>
						<Button
							accessibilityLabel={`Dismiss: ${describeChange(change)}`}
							onPress={() => onDismiss(change.id)}
							variant="secondary"
						>
							Dismiss
						</Button>
					</View>
				))}
			</View>
		)}
	</View>
);
