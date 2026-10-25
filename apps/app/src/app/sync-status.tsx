import { useStatus } from "@powersync/react";

import { SyncStatus } from "@/features/sync/sync-status";
import {
	dismissRejectedChange,
	useRejectedChanges,
} from "@/features/sync/use-rejected-changes";

export default function SyncStatusScreen() {
	return (
		<SyncStatus
			connected={useStatus().connected}
			onDismiss={(id) => void dismissRejectedChange(id)}
			rejectedChanges={useRejectedChanges()}
		/>
	);
}
