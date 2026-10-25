import { useLingui } from "@lingui/react/macro";
import { useStatus } from "@powersync/react";
import { router } from "expo-router";

import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { Screen } from "@/features/shell/screen";
import { SyncStatus } from "@/features/sync/sync-status";
import {
	dismissRejectedChange,
	useRejectedChanges,
} from "@/features/sync/use-rejected-changes";
import { supabase } from "@/lib/supabase";

const SyncStatusSheet = () => {
	const { t } = useLingui();
	return (
		<Sheet>
			<SheetTrigger asChild>
				<Button variant="secondary">{t`Sync status`}</Button>
			</SheetTrigger>
			<SheetContent>
				<SheetTitle>{t`Sync status`}</SheetTitle>
				<SyncStatus
					connected={useStatus().connected}
					onDismiss={(id) => void dismissRejectedChange(id)}
					rejectedChanges={useRejectedChanges()}
				/>
			</SheetContent>
		</Sheet>
	);
};

export default function MeAndHousehold() {
	const { t } = useLingui();
	return (
		<Screen title={t`Me & household`}>
			<Text variant="muted">{t`Household settings, Members and your preferences arrive here.`}</Text>
			<Button
				onPress={() => router.push("/wallets")}
				variant="secondary"
			>
				{t`Wallets`}
			</Button>
			<Button
				onPress={() => router.push("/categories")}
				variant="secondary"
			>
				{t`Categories`}
			</Button>
			<SyncStatusSheet />
			<Button
				onPress={() => void supabase.auth.signOut()}
				variant="secondary"
			>
				{t`Sign out`}
			</Button>
		</Screen>
	);
}
