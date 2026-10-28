import { type FullBackup } from "@hisaab/domain";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { formatDateTime } from "@/lib/format";

import type { UnpackedBackup } from "./zip";

type Chosen = Extract<UnpackedBackup, { backup: FullBackup }>;
type Problem = Extract<UnpackedBackup, { problem: string }>["problem"];

const NOT_A_BACKUP: Problem = "not_a_backup";
const NEWER_VERSION: Problem = "newer_version";
/** As long as a household name the app takes. */
const MAX_NAME = 80;
const PRIMARY = "primary";
const SECONDARY = "secondary";

/**
 * Restoring a Full backup into a new household (spec §3.4): pick the file, see what's in it, name the household,
 * restore. The restorer is the new household's Admin; others are invited again.
 */
export const RestoreForm = ({
	onChoose,
	onRestore,
	onDone,
}: {
	/** Lets the User pick a file; null when they back out. */
	onChoose: () => Promise<UnpackedBackup | null>;
	/** Restores it; answers with how many Attachment files didn't come back. */
	onRestore: (chosen: Chosen, name: string) => Promise<number>;
	/** Once it's restored: on to the new household. */
	onDone: () => void;
}) => {
	const { t } = useLingui();
	const [chosen, setChosen] = useState<Chosen | null>(null);
	const [name, setName] = useState("");
	const [problem, setProblem] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	/** Set once it's restored, with how many files didn't come back: it's never restored twice. */
	const [missing, setMissing] = useState<number | null>(null);

	const choose = async () => {
		setProblem(null);
		const picked = await onChoose().catch(() => null);
		if (!picked) return;
		if ("problem" in picked) {
			setChosen(null);
			setProblem(
				picked.problem === NOT_A_BACKUP
					? t`That file isn't a Hisaab Full backup.`
					: picked.problem === NEWER_VERSION
						? t`That backup is from a newer version of Hisaab. Update the app, then restore it.`
						: t`That backup is damaged and can't be restored.`,
			);
			return;
		}
		const { name: householdName } = picked.backup.household;
		setChosen(picked);
		// Short enough for a household's name, suffix and all.
		const short = householdName.slice(0, MAX_NAME - 11).trim();
		setName(t`${short} (restored)`);
	};

	const restore = async () => {
		if (!chosen) return;
		setBusy(true);
		setProblem(null);
		try {
			const left = await onRestore(chosen, name);
			if (left === 0) onDone();
			else setMissing(left);
		} catch {
			setProblem(t`That didn't restore. Try again.`);
		} finally {
			setBusy(false);
		}
	};

	const counts = chosen?.backup.tables;
	const madeOn = chosen ? formatDateTime(chosen.backup.created_at) : "";
	const entryCount = counts?.entries.length ?? 0;
	const walletCount = counts?.wallets.length ?? 0;
	const fileCount = chosen?.files.size ?? 0;
	if (missing !== null)
		return (
			<View className="gap-4">
				<Text role="status">
					{t`Restored, but ${plural(missing, { one: "# Attachment file", other: "# Attachment files" })} didn't come back.`}
				</Text>
				<Button onPress={onDone}>{t`Go to the household`}</Button>
			</View>
		);
	return (
		<View className="gap-4">
			<Text variant="muted">
				{t`A Full backup restores into a new household, with you as its Admin. Invite the others again once it's in.`}
			</Text>
			<Button
				disabled={busy}
				onPress={() => void choose()}
				variant={chosen ? SECONDARY : PRIMARY}
			>
				{chosen ? t`Choose another file` : t`Choose a Full backup`}
			</Button>
			{chosen && (
				<>
					<Text>
						{t`Made ${madeOn}: ${plural(walletCount, { one: "# Wallet", other: "# Wallets" })}, ${plural(entryCount, { one: "# Entry", other: "# Entries" })} and ${plural(fileCount, { one: "# Attachment file", other: "# Attachment files" })}.`}
					</Text>
					<Input
						label={t`New household's name`}
						maxLength={MAX_NAME}
						onChangeText={setName}
						value={name}
					/>
					<Button
						disabled={
							busy || name.trim() === "" || name.trim().length > MAX_NAME
						}
						onPress={() => void restore()}
					>
						{busy ? t`Restoring…` : t`Restore into a new household`}
					</Button>
				</>
			)}
			{problem !== null && (
				<Text
					className="text-bad"
					role="alert"
				>
					{problem}
				</Text>
			)}
		</View>
	);
};
