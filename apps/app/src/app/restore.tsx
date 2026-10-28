import { useLingui } from "@lingui/react/macro";

import { restoreFullBackup } from "@/features/backup/actions";
import { RestoreForm } from "@/features/backup/restore-form";
import { unpackBackup } from "@/features/backup/zip";
import { setCurrentHousehold } from "@/features/households/actions";
import { Screen } from "@/features/shell/screen";
import { chooseZipBytes } from "@/lib/files/read-zip";
import { leaveTo } from "@/lib/navigation";
import { useSignedInUserId } from "@/lib/session";

export default function RestoreBackup() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	return (
		<Screen title={t`Restore a Full backup`}>
			<RestoreForm
				onChoose={async () => {
					const bytes = await chooseZipBytes();
					return bytes ? unpackBackup(bytes) : null;
				}}
				onRestore={async ({ backup, files }, name) => {
					const id = await restoreFullBackup(userId, backup, files, name);
					await setCurrentHousehold(id);
					leaveTo("/");
				}}
			/>
		</Screen>
	);
}
