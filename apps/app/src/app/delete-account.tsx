import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";

import {
	accountBlockers,
	deleteAccount,
	forgetDeletedAccount,
	sendDeletionCode,
	verifyDeletionCode,
} from "@/features/account/api";
import { DeleteAccountFlow } from "@/features/account/delete-account-flow";
import { makeFullBackup } from "@/features/backup/actions";
import { FullBackupSection } from "@/features/backup/full-backup-section";
import { setCurrentHousehold } from "@/features/households/actions";
import { usePersonalHousehold } from "@/features/households/use-personal-household";
import { Screen } from "@/features/shell/screen";
import { entryTimeZone, todayIn } from "@/lib/dates";
import { backupFileName } from "@/lib/files/export-name";
import { saveZip } from "@/lib/files/save-zip";
import { useSession, useSignedInUserId } from "@/lib/session";

const MEMBERS = "/members";
const HOUSEHOLD = "/household";
const PROMOTE = "promote";

export default function DeleteAccount() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const email = useSession()?.user.email ?? "";
	const personal = usePersonalHousehold(userId);
	return (
		<Screen title={t`Delete account`}>
			<DeleteAccountFlow
				backup={
					personal && (
						<FullBackupSection
							onMake={async () => {
								const { bytes, missingFiles } = await makeFullBackup(
									personal.id,
								);
								await saveZip(
									backupFileName(t`Personal`, todayIn(entryTimeZone(personal))),
									bytes,
								);
								return missingFiles;
							}}
						/>
					)
				}
				email={email}
				onCheck={accountBlockers}
				onDelete={deleteAccount}
				// Signing out wipes this device; the signed-out guard then shows sign-in.
				onDeleted={() => void forgetDeletedAccount()}
				onFix={(householdId, fix) => {
					void setCurrentHousehold(householdId).then(() =>
						router.push(fix === PROMOTE ? MEMBERS : HOUSEHOLD),
					);
				}}
				onSendCode={() => sendDeletionCode(email)}
				onVerify={(code) => verifyDeletionCode(email, code)}
			/>
		</Screen>
	);
}
