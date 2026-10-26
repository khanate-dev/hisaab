import {
	INVITE_LIFETIMES,
	type InviteLifetime,
	ROLES,
	type Role,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import { useSave } from "@/features/entries/form-checks";
import { ROLE_LABELS } from "@/features/households/household-list";

import type { InviteDraft } from "./actions";

const DEFAULT_ROLE: Role = "member";
const DEFAULT_LIFETIME: InviteLifetime = 7;
/** Roughly an email: something@something.something. Auth checks the real address on sign-in. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A new Invite: the Role it gives, optionally one email it's for, and how long it lasts. */
export const InviteForm = ({
	onSubmit,
}: {
	onSubmit: (draft: InviteDraft) => Promise<void>;
}) => {
	const { t, i18n } = useLingui();
	const { busy, error, setError, save } = useSave();
	const [role, setRole] = useState<Role>(DEFAULT_ROLE);
	const [email, setEmail] = useState("");
	const [lifetime, setLifetime] = useState<InviteLifetime>(DEFAULT_LIFETIME);

	const lifetimeLabel = (days: InviteLifetime) =>
		days === 1 ? t`1 day` : t`${days} days`;

	const submit = async () => {
		const trimmed = email.trim();
		if (trimmed !== "" && (!EMAIL.test(trimmed) || trimmed.length > 320))
			return setError(
				t`Enter an email like sara@example.com, or leave it empty.`,
			);
		await save(async () => {
			await onSubmit({
				role,
				email: trimmed === "" ? null : trimmed,
				lifetime,
			});
			setEmail("");
		});
	};

	return (
		<View className="gap-4">
			<View className="gap-2">
				<Text variant="label">{t`Joins as`}</Text>
				<RadioGroup
					label={t`Joins as`}
					onValueChange={setRole}
					options={ROLES.map((option) => ({
						value: option,
						label: i18n._(ROLE_LABELS[option]),
					}))}
					value={role}
				/>
			</View>
			<Input
				autoCapitalize="none"
				hint={t`Optional. Only someone signed in with this email can use the link.`}
				inputMode="email"
				label={t`For email`}
				onChangeText={setEmail}
				value={email}
			/>
			<View className="gap-2">
				<Text variant="label">{t`Link works for`}</Text>
				<RadioGroup
					label={t`Link works for`}
					onValueChange={(days) => setLifetime(Number(days) as InviteLifetime)}
					options={INVITE_LIFETIMES.map((days) => ({
						value: String(days),
						label: lifetimeLabel(days),
					}))}
					value={String(lifetime)}
				/>
			</View>
			{error !== null && (
				<Text
					className="text-bad"
					role="alert"
				>
					{error}
				</Text>
			)}
			<Button
				disabled={busy}
				onPress={() => void submit()}
			>
				{t`Create Invite`}
			</Button>
		</View>
	);
};
