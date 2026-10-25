import { useStatus } from "@powersync/react";

import { SyncStatus } from "@/features/sync/sync-status";
import {
	dismissRejection,
	useRejections,
} from "@/features/sync/use-rejections";

export default function SyncStatusScreen() {
	return (
		<SyncStatus
			connected={useStatus().connected}
			onDismiss={(id) => void dismissRejection(id)}
			rejections={useRejections()}
		/>
	);
}
