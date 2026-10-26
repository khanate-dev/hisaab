import { inviteStanding, type InviteStanding } from "@hisaab/domain";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import { ROLE_LABELS } from "@/features/households/household-list";
import { formatDateTime } from "@/lib/format";

import type { InviteRow } from "./use-invites";

const STANDING_LABELS: Record<
	Exclude<InviteStanding, "open">,
	MessageDescriptor
> = {
	revoked: msg`Revoked`,
	used: msg`Used`,
	expired: msg`Expired`,
};

type Props = {
	invites: readonly InviteRow[];
	now: Date;
	/** The link a token is shared as. */
	linkFor: (token: string) => string;
	onRevoke: (inviteId: string) => void;
};

/** The household's Invites: open ones with their link and a Revoke, then the rest with why they no longer work. */
export const InviteList = ({ invites, now, linkFor, onRevoke }: Props) => {
	const { t, i18n } = useLingui();
	if (invites.length === 0) {
		return (
			<Text
				role="status"
				variant="muted"
			>
				{t`No Invites yet.`}
			</Text>
		);
	}

	return (
		<View role="list">
			{invites.map((invite) => {
				const standing = inviteStanding(
					{
						id: invite.id,
						householdId: invite.household_id,
						householdName: "",
						role: invite.role,
						email: invite.email,
						expiresAt: invite.expires_at,
						revokedAt: invite.revoked_at,
						acceptedAt: invite.accepted_at,
					},
					now,
				);
				const role = i18n._(ROLE_LABELS[invite.role]);
				const who = invite.email ?? t`anyone with the link`;
				const until = formatDateTime(invite.expires_at);
				const summary = t`${role}, for ${who}`;
				return (
					<View
						className="gap-1 border-b-2 border-border py-2"
						key={invite.id}
						role="listitem"
					>
						<Text variant="label">{summary}</Text>
						{standing === "open" ? (
							<>
								<Text variant="muted">{t`Works until ${until}`}</Text>
								<Text
									accessibilityLabel={t`Invite link`}
									selectable
								>
									{linkFor(invite.token)}
								</Text>
								<View className="flex-row">
									<Chip
										accessibilityLabel={t`Revoke the Invite for ${who}`}
										onPress={() => onRevoke(invite.id)}
									>
										{t`Revoke`}
									</Chip>
								</View>
							</>
						) : (
							<Text variant="muted">{i18n._(STANDING_LABELS[standing])}</Text>
						)}
					</View>
				);
			})}
		</View>
	);
};
