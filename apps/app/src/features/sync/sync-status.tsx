import { NO_ROWS, UNMAPPABLE, type uploadErrors } from "@hisaab/client-schema";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";

/** A local change the server rejected (CONTEXT.md: Rejected change). */
export type RejectedChange = typeof uploadErrors.$inferSelect;

type Described = { title: MessageDescriptor; dismiss: MessageDescriptor };

/** Whole sentences per case, so translators never get a noun phrase spliced into a sentence. */
const CHANGES: Record<string, Record<RejectedChange["op"], Described>> = {
	households: {
		PUT: {
			title: msg`A new household couldn't sync`,
			dismiss: msg`Dismiss: new household`,
		},
		PATCH: {
			title: msg`A change to a household couldn't sync`,
			dismiss: msg`Dismiss: change to a household`,
		},
		DELETE: {
			title: msg`Deleting a household couldn't sync`,
			dismiss: msg`Dismiss: deleting a household`,
		},
	},
	memberships: {
		PUT: {
			title: msg`A new membership couldn't sync`,
			dismiss: msg`Dismiss: new membership`,
		},
		PATCH: {
			title: msg`A change to a membership couldn't sync`,
			dismiss: msg`Dismiss: change to a membership`,
		},
		DELETE: {
			title: msg`Deleting a membership couldn't sync`,
			dismiss: msg`Dismiss: deleting a membership`,
		},
	},
};

const UNKNOWN_CHANGE: Described = {
	title: msg`A change couldn't sync`,
	dismiss: msg`Dismiss this change`,
};

const describeChange = ({ op, table_name }: RejectedChange): Described =>
	CHANGES[table_name]?.[op] ?? UNKNOWN_CHANGE;

/** The reason, translated; anything unexpected shows the server's own message. */
const describeReason = ({
	code,
	message,
}: RejectedChange): MessageDescriptor | string => {
	if (code === NO_ROWS) return msg`No permission, or someone else deleted it.`;
	if (code === "42501") return msg`No permission.`;
	if (code === UNMAPPABLE)
		return msg`Made by an older version of the app, and it no longer fits.`;
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
}: Props) => {
	const { t, i18n } = useLingui();
	return (
		<View className="gap-4">
			<Text role="status">
				{!connected
					? t`Offline. Changes sync when you're back online.`
					: rejectedChanges.length === 0
						? t`Online. Every change synced.`
						: t`Online.`}
			</Text>
			{rejectedChanges.length > 0 && (
				<View
					className="gap-3"
					role="list"
				>
					{rejectedChanges.map((change) => {
						const described = describeChange(change);
						const reason = describeReason(change);
						return (
							<Card
								className="bg-surface-2"
								key={change.id}
								role="listitem"
							>
								<Text variant="label">{i18n._(described.title)}</Text>
								<Text variant="muted">
									{typeof reason === "string" ? reason : i18n._(reason)}
								</Text>
								<Button
									accessibilityLabel={i18n._(described.dismiss)}
									onPress={() => onDismiss(change.id)}
									variant="secondary"
								>
									{t`Dismiss`}
								</Button>
							</Card>
						);
					})}
				</View>
			)}
		</View>
	);
};
