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

const describeChange = ({
	op,
	table_name,
}: RejectedChange): MessageDescriptor => {
	if (table_name === "households") {
		if (op === "PUT") return msg`New household`;
		if (op === "DELETE") return msg`Deleting a household`;
		return msg`Change to a household`;
	}
	if (table_name === "memberships") {
		if (op === "PUT") return msg`New membership`;
		if (op === "DELETE") return msg`Deleting a membership`;
		return msg`Change to a membership`;
	}
	return msg`A change`;
};

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
				{connected
					? t`Online.`
					: t`Offline. Changes sync when you're back online.`}
				{rejectedChanges.length === 0 && ` ${t`Every change synced.`}`}
			</Text>
			{rejectedChanges.length > 0 && (
				<View
					className="gap-3"
					role="list"
				>
					{rejectedChanges.map((change) => {
						const what = i18n._(describeChange(change));
						const reason = describeReason(change);
						return (
							<Card
								className="bg-surface-2"
								key={change.id}
								role="listitem"
							>
								<Text variant="label">{t`${what} couldn't sync`}</Text>
								<Text variant="muted">
									{typeof reason === "string" ? reason : i18n._(reason)}
								</Text>
								<Button
									accessibilityLabel={t`Dismiss: ${what}`}
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
