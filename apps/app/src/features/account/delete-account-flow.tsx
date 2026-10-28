import {
	type BlockingHousehold,
	DELETE_CONFIRMATION,
	type DeleteAccountAnswer,
} from "@hisaab/domain";
import { Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode, useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

type Step = "intro" | "blocked" | "code" | "confirm";
const INTRO: Step = "intro";
const BLOCKED: Step = "blocked";
const CODE: Step = "code";
const CONFIRM: Step = "confirm";
const PROMOTE = "promote";
const DELETE_HOUSEHOLD = "delete";
const SECONDARY = "secondary";

/**
 * Deleting an account (spec §3.1; issue #12): immediate, online only, after a Full backup of the Personal household is
 * offered, any blocking households are sorted out, a fresh email code is entered and the confirmation is typed.
 */
export const DeleteAccountFlow = ({
	email,
	backup,
	onCheck,
	onFix,
	onSendCode,
	onVerify,
	onDelete,
	onDeleted,
}: {
	email: string;
	/** Making a Full backup of the Personal household first, offered before anything else. */
	backup: ReactNode;
	onCheck: () => Promise<BlockingHousehold[]>;
	/** Goes to fix a blocking household: promote another Admin, or delete the household. */
	onFix: (householdId: string, fix: "promote" | "delete") => void;
	onSendCode: () => Promise<void>;
	onVerify: (code: string) => Promise<void>;
	onDelete: (confirmation: string) => Promise<DeleteAccountAnswer>;
	/** It's deleted: the device signs out and forgets it. */
	onDeleted: () => void;
}) => {
	const { t } = useLingui();
	const [step, setStep] = useState<Step>(INTRO);
	const [blockers, setBlockers] = useState<BlockingHousehold[]>([]);
	const [sent, setSent] = useState(false);
	const [code, setCode] = useState("");
	const [typed, setTyped] = useState("");
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);

	const run = async (work: () => Promise<void>, failed: string) => {
		setBusy(true);
		setProblem(null);
		try {
			await work();
		} catch {
			setProblem(failed);
		} finally {
			setBusy(false);
		}
	};
	const offline = t`That didn't go through. Check you're online and try again.`;

	const check = () =>
		run(async () => {
			const found = await onCheck();
			setBlockers(found);
			setStep(found.length > 0 ? BLOCKED : CODE);
		}, offline);
	const send = () =>
		run(async () => {
			await onSendCode();
			setSent(true);
		}, offline);
	const verify = () =>
		run(
			async () => {
				await onVerify(code.trim());
				setStep(CONFIRM);
			},
			t`That code didn't work. Check it, or send a new one.`,
		);
	const remove = () =>
		run(async () => {
			const answer = await onDelete(typed);
			if (answer.status === "deleted") return onDeleted();
			if (answer.status === "blocked") {
				setBlockers(answer.households);
				setStep(BLOCKED);
			} else if (answer.status === "stale_otp") {
				setSent(false);
				setCode("");
				setStep(CODE);
				setProblem(t`That took a while: confirm it's you with a new code.`);
			} else setProblem(offline);
		}, offline);

	return (
		<View className="gap-4">
			{step === INTRO && (
				<>
					<Text>
						{t`Deleting your account is immediate and can't be undone. Your Personal household goes, with everything in it. In households you share, what you recorded stays, under an anonymous Former member. Your Invites are revoked.`}
					</Text>
					{backup}
					<Button
						disabled={busy}
						onPress={() => void check()}
					>
						{t`Continue`}
					</Button>
				</>
			)}
			{step === BLOCKED && (
				<>
					<Text>
						{t`You're the only Admin of these households, and others are in them. Make someone else an Admin, or delete the household, first.`}
					</Text>
					{blockers.map(({ householdId, name }) => (
						<View
							className="gap-2"
							key={householdId}
						>
							<Text variant="title">{name}</Text>
							<View className="flex-row flex-wrap gap-3">
								<Button
									onPress={() => onFix(householdId, PROMOTE)}
									variant={SECONDARY}
								>
									{t`Make someone else an Admin`}
								</Button>
								<Button
									onPress={() => onFix(householdId, DELETE_HOUSEHOLD)}
									variant={SECONDARY}
								>
									{t`Delete the household`}
								</Button>
							</View>
						</View>
					))}
					<Button
						disabled={busy}
						onPress={() => void check()}
					>
						{t`Check again`}
					</Button>
				</>
			)}
			{step === CODE && (
				<>
					<Text>{t`Confirm it's you: we'll email a code to sign in with again.`}</Text>
					{sent ? (
						<>
							<Text variant="muted">
								<Trans>We emailed a code to {email}.</Trans>
							</Text>
							<Input
								autoComplete="one-time-code"
								inputMode="numeric"
								label={t`Code`}
								onChangeText={setCode}
								value={code}
							/>
							<Button
								disabled={busy || code.trim() === ""}
								onPress={() => void verify()}
							>
								{t`Confirm`}
							</Button>
						</>
					) : (
						<Button
							disabled={busy}
							onPress={() => void send()}
						>
							{t`Email me a code`}
						</Button>
					)}
				</>
			)}
			{step === CONFIRM && (
				<>
					<Input
						autoCapitalize="characters"
						hint={t`Type ${DELETE_CONFIRMATION} to delete your account for good.`}
						label={t`Confirmation`}
						onChangeText={setTyped}
						value={typed}
					/>
					<Button
						disabled={busy || typed !== DELETE_CONFIRMATION}
						onPress={() => void remove()}
					>
						{t`Delete my account`}
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
