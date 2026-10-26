import { useLingui } from "@lingui/react/macro";

import { setContactArchived, createContact } from "@/features/contacts/actions";
import { ContactList } from "@/features/contacts/contact-list";
import { useContacts } from "@/features/contacts/use-contacts";
import { useCanWrite } from "@/features/households/use-can-write";
import { usePersonalHousehold } from "@/features/households/use-personal-household";
import { Screen } from "@/features/shell/screen";
import { useSignedInUserId } from "@/lib/session";

export default function Contacts() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const household = usePersonalHousehold(userId);
	const contacts = useContacts(household?.id);
	const canWrite = useCanWrite(household?.id, userId) === true;

	return (
		<Screen title={t`Contacts`}>
			{household && contacts !== undefined && (
				<ContactList
					canEdit={canWrite}
					contacts={contacts}
					onAdd={async (name) => {
						await createContact(household.id, name);
					}}
					onArchive={setContactArchived}
				/>
			)}
		</Screen>
	);
}
