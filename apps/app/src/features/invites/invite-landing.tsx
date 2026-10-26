import type { AcceptResult, InvitePreview } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { ROLE_LABELS } from "@/features/households/household-list";

type Props = {
	/** Undefined while it loads. */
	preview: InvitePreview | undefined;
	/** The preview couldn't be fetched (offline, say). */
	failed: boolean;
	signedIn: boolean;
	onSignIn: () => void;
	onJoin: () => Promise<AcceptResult>;
};

/** Where an Invite link lands (spec §4.3): who's inviting and as what Role, then sign in, then Join. */
export const InviteLanding = ({
	preview,
	failed,
	signedIn,
	onSignIn,
	onJoin,
}: Props) => {
	const { t, i18n } = useLingui();
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<AcceptResult | null>(null);
	const [joinFailed, setJoinFailed] = useState(false);

	if (failed) {
		return (
			<Text
				className="text-bad"
				role="alert"
			>
				{t`Couldn't open the Invite. Check your connection and try again.`}
			</Text>
		);
	}
	if (preview === undefined) {
		return (
			<Text
				role="status"
				variant="muted"
			>
				{t`Opening the Invite…`}
			</Text>
		);
	}
	if (preview.status === "not_found") {
		return (
			<Text role="alert">{t`This Invite link doesn't work. Ask for a new one.`}</Text>
		);
	}

	const name = preview.householdName;
	const role = i18n._(ROLE_LABELS[preview.role]);
	const closed =
		preview.status === "revoked"
			? t`This Invite was revoked. Ask for a new one.`
			: preview.status === "used"
				? t`This Invite has already been used. Ask for a new one.`
				: preview.status === "expired"
					? t`This Invite has expired. Ask for a new one.`
					: null;
	const refused =
		result === null
			? null
			: result.status === "wrong_email"
				? t`This Invite is for a different email address. Sign in with that one to join.`
				: result.status === "signed_out"
					? t`Sign in again to join.`
					: result.status === "revoked" ||
						  result.status === "used" ||
						  result.status === "expired"
						? t`This Invite no longer works. Ask for a new one.`
						: result.status === "not_found"
							? t`This Invite link doesn't work. Ask for a new one.`
							: null;
	const joined =
		result?.status === "joined" || result?.status === "already_member";

	const join = async () => {
		setBusy(true);
		setJoinFailed(false);
		try {
			setResult(await onJoin());
		} catch {
			setJoinFailed(true);
		} finally {
			setBusy(false);
		}
	};

	return (
		<Card>
			<Text variant="title">{t`Join ${name}`}</Text>
			<Text>{t`You're invited as ${role}.`}</Text>
			{preview.emailRestricted && (
				<Text variant="muted">{t`This Invite is for one email address; sign in with it.`}</Text>
			)}
			{closed !== null ? (
				<Text role="alert">{closed}</Text>
			) : joined ? (
				<Text role="status">{t`You're in. Getting ${name} ready…`}</Text>
			) : (
				<View className="gap-3">
					{refused !== null && (
						<Text
							className="text-bad"
							role="alert"
						>
							{refused}
						</Text>
					)}
					{joinFailed && (
						<Text
							className="text-bad"
							role="alert"
						>
							{t`Couldn't join just now. Check your connection and try again.`}
						</Text>
					)}
					{signedIn ? (
						<Button
							disabled={busy}
							onPress={() => void join()}
						>
							{t`Join`}
						</Button>
					) : (
						<Button onPress={onSignIn}>{t`Sign in to join`}</Button>
					)}
				</View>
			)}
		</Card>
	);
};
