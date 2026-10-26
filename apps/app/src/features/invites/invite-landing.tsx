import {
	type AcceptResult,
	type InvitePreview,
	joinedHousehold,
} from "@hisaab/domain";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { ROLE_LABELS } from "@/features/households/labels";

/** Why an Invite can't be used, whether the preview or an accept said so. */
const REFUSALS: Record<
	Exclude<AcceptResult["status"], "joined" | "already_member">,
	MessageDescriptor
> = {
	not_found: msg`This Invite link doesn't work. Ask for a new one.`,
	revoked: msg`This Invite was revoked. Ask for a new one.`,
	used: msg`This Invite has already been used. Ask for a new one.`,
	expired: msg`This Invite has expired. Ask for a new one.`,
	wrong_email: msg`This Invite is for a different email address. Sign in with that one to join.`,
	signed_out: msg`Sign in again to join.`,
};

type Props = {
	/** Undefined while it loads. */
	preview: InvitePreview | undefined;
	/** The preview couldn't be fetched (offline, say). */
	failed: boolean;
	/** Signing in first; absent once signed in. */
	onSignIn?: (() => void) | undefined;
	onJoin: () => Promise<AcceptResult>;
	/** A way on without this Invite (in onboarding, setting up on their own); offered once it can't be used. */
	onLeave?: (() => void) | undefined;
};

/** Where an Invite link lands (spec §4.3): who's inviting and as what Role, then sign in, then Join. */
export const InviteLanding = ({
	preview,
	failed,
	onSignIn,
	onJoin,
	onLeave,
}: Props) => {
	const { t, i18n } = useLingui();
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<AcceptResult | null>(null);
	const [joinFailed, setJoinFailed] = useState(false);

	const leave = onLeave && (
		<Button
			onPress={onLeave}
			variant="secondary"
		>
			{t`Set up on my own instead`}
		</Button>
	);

	if (failed) {
		return (
			<View className="gap-3">
				<Text
					className="text-bad"
					role="alert"
				>
					{t`Couldn't open the Invite. Check your connection and try again.`}
				</Text>
				{leave}
			</View>
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
			<View className="gap-3">
				<Text role="alert">{i18n._(REFUSALS.not_found)}</Text>
				{leave}
			</View>
		);
	}

	const name = preview.householdName;
	const role = i18n._(ROLE_LABELS[preview.role]);
	const invitedAs = preview.emailRestricted
		? t`You're invited as ${role}. This Invite is for one email address; sign in with it.`
		: t`You're invited as ${role}.`;
	const closed =
		preview.status === "open" ? null : i18n._(REFUSALS[preview.status]);
	const joined = result !== null && joinedHousehold(result) !== null;
	const refused =
		result === null || joined
			? null
			: i18n._(REFUSALS[result.status as keyof typeof REFUSALS]);

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
			<Text accessibilityLabel={invitedAs}>{invitedAs}</Text>
			{closed !== null ? (
				<View className="gap-3">
					<Text role="alert">{closed}</Text>
					{leave}
				</View>
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
					{onSignIn ? (
						<Button onPress={onSignIn}>{t`Sign in to join`}</Button>
					) : (
						<Button
							disabled={busy}
							onPress={() => void join()}
						>
							{t`Join`}
						</Button>
					)}
					{refused !== null && leave}
				</View>
			)}
		</Card>
	);
};
