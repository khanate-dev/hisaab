import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

/**
 * Making a Full backup (CONTEXT.md; Admins only): every record of the household and its Attachment files, as one ZIP
 * to keep or share, restorable into a new household.
 */
export const FullBackupSection = ({
	onMake,
}: {
	/** Builds the backup and hands it over (share sheet or download). */
	onMake: () => Promise<void>;
}) => {
	const { t } = useLingui();
	const [status, setStatus] = useState<"idle" | "busy" | "done" | "failed">(
		IDLE,
	);
	const make = async () => {
		setStatus(BUSY);
		try {
			await onMake();
			setStatus(DONE);
		} catch {
			setStatus(FAILED);
		}
	};
	return (
		<View className="gap-2">
			<Text variant="title">{t`Full backup`}</Text>
			<Text variant="muted">
				{t`Everything in this household, Attachments included, as one file. Restore it into a new household from the household switcher.`}
			</Text>
			<Button
				disabled={status === BUSY}
				onPress={() => void make()}
				variant="secondary"
			>
				{status === BUSY ? t`Making the backup…` : t`Make a Full backup`}
			</Button>
			{status === DONE && (
				<Text role="status">{t`The Full backup is made.`}</Text>
			)}
			{status === FAILED && (
				<Text
					className="text-bad"
					role="alert"
				>
					{t`Couldn't make the backup. Attachment files need a connection; check you're online and try again.`}
				</Text>
			)}
		</View>
	);
};

const IDLE = "idle";
const BUSY = "busy";
const DONE = "done";
const FAILED = "failed";
