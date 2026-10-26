import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { CONTACT_NAME_MAX } from "@/features/contacts/limits";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

import type { Contact } from "./use-contacts";

type Props = {
	contacts: readonly Contact[];
	/** Admins and Members keep the list; Viewers only see it. */
	canEdit: boolean;
	onAdd: (name: string) => Promise<void>;
	onArchive: (contactId: string, archived: boolean) => Promise<void>;
};

/** The household's Contacts (CONTEXT.md): people outside the app who can be a Loan's counterparty. */
export const ContactList = ({ contacts, canEdit, onAdd, onArchive }: Props) => {
	const { t } = useLingui();
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);

	const add = async () => {
		const trimmed = name.trim();
		if (trimmed === "" || trimmed.length > CONTACT_NAME_MAX)
			return setError(
				t`Name the Contact, in ${CONTACT_NAME_MAX} characters or fewer.`,
			);
		setError(null);
		await onAdd(trimmed);
		setName("");
	};

	return (
		<View className="gap-4">
			{canEdit && (
				<View className="gap-2">
					<Input
						label={t`New Contact`}
						onChangeText={setName}
						value={name}
					/>
					{error !== null && (
						<Text
							className="text-bad"
							role="alert"
						>
							{error}
						</Text>
					)}
					<Button onPress={() => void add()}>{t`Add Contact`}</Button>
				</View>
			)}
			{contacts.length === 0 ? (
				<Text
					role="status"
					variant="muted"
				>
					{t`No Contacts yet.`}
				</Text>
			) : (
				<View role="list">
					{contacts.map((contact) => {
						const archived = contact.archived_at !== null;
						const contactName = contact.name;
						return (
							<View
								className="min-h-12 flex-row items-center justify-between gap-3 border-b-2 border-border py-2"
								key={contact.id}
								role="listitem"
							>
								<Text
									className={archived ? "text-muted" : ""}
									variant="label"
								>
									{archived ? t`${contactName} (archived)` : contactName}
								</Text>
								{canEdit && (
									<Chip
										accessibilityLabel={
											archived
												? t`Unarchive ${contactName}`
												: t`Archive ${contactName}`
										}
										onPress={() => void onArchive(contact.id, !archived)}
									>
										{archived ? t`Unarchive` : t`Archive`}
									</Chip>
								)}
							</View>
						);
					})}
				</View>
			)}
		</View>
	);
};
