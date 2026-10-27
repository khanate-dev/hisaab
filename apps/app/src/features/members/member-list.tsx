import { ROLES, type Role } from "@hisaab/client-schema";
import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Confirm } from "@/components/ui/confirm";
import { RadioGroup } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import { ROLE_LABELS } from "@/features/households/labels";

import type { Member } from "./use-members";

type Props = {
	members: readonly Member[];
	/** The signed-in User, whose own row has no controls (they leave from household settings). */
	userId: string;
	/** Only Admins change Roles and remove Members. */
	isAdmin: boolean;
	onChangeRole: (membershipId: string, role: Role) => void;
	onRemove: (membershipId: string) => void;
};

/** Members & Roles (spec §3.1): everyone in the household and their Role; an Admin changes Roles and removes people. */
export const MemberList = ({
	members,
	userId,
	isAdmin,
	onChangeRole,
	onRemove,
}: Props) => {
	const { t, i18n } = useLingui();
	return (
		<View role="list">
			{members.map((member) => {
				const you = member.userId === userId;
				const name = member.name ?? t`Someone`;
				const shown = you ? t`${name} (you)` : name;
				const role = i18n._(ROLE_LABELS[member.role]);
				return (
					<View
						className="gap-2 border-b-2 border-border py-3"
						key={member.membershipId}
						role="listitem"
					>
						<Text
							accessibilityLabel={t`${shown}, ${role}`}
							variant="label"
						>
							{shown}
						</Text>
						{isAdmin && !you ? (
							<View className="gap-2">
								<RadioGroup
									compact
									label={t`${name}'s Role`}
									onValueChange={(next) =>
										onChangeRole(member.membershipId, next)
									}
									options={ROLES.map((option) => ({
										value: option,
										label: i18n._(ROLE_LABELS[option]),
									}))}
									value={member.role}
								/>
								<View className="flex-row">
									<Confirm
										action={t`Remove`}
										description={t`They lose this household from their devices. What they recorded stays.`}
										onConfirm={() => onRemove(member.membershipId)}
										title={t`Remove ${name}?`}
										trigger={t`Remove ${name}`}
									/>
								</View>
							</View>
						) : (
							<Text variant="muted">{role}</Text>
						)}
					</View>
				);
			})}
		</View>
	);
};
