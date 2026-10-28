import { plural } from "@lingui/core/macro";
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
	/** Builds the backup and hands it over (share sheet or download); answers with how many files were left out. */
	onMake: () => Promise<number>;
}) => {
	const { t } = useLingui();
	const [missing, setMissing] = useState(0);
	const [status, setStatus] = useState<"idle" | "busy" | "done" | "failed">(
		IDLE,
	);
	const make = async () => {
		setStatus(BUSY);
		try {
			setMissing(await onMake());
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
				<Text role="status">
					{missing === 0
						? t`The Full backup is made.`
						: t`The Full backup is made, but ${plural(missing, { one: "# Attachment file", other: "# Attachment files" })} couldn't be had and ${plural(missing, { one: "isn't", other: "aren't" })} in it. Make it again online to include them.`}
				</Text>
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
