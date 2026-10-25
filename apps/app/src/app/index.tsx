import { useStatus } from "@powersync/react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { HouseholdList } from "@/features/households/household-list";
import { useHouseholds } from "@/features/households/use-households";
import { SyncStatus } from "@/features/sync/sync-status";
import {
	dismissRejectedChange,
	useRejectedChanges,
} from "@/features/sync/use-rejected-changes";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

const Households = ({ userId }: { userId: string }) => (
	<HouseholdList households={useHouseholds(userId)} />
);

const SyncStatusSheet = () => (
	<Sheet>
		<SheetTrigger asChild>
			<Button variant="secondary">Sync status</Button>
		</SheetTrigger>
		<SheetContent>
			<SheetTitle>Sync status</SheetTitle>
			<SyncStatus
				connected={useStatus().connected}
				onDismiss={(id) => void dismissRejectedChange(id)}
				rejectedChanges={useRejectedChanges()}
			/>
		</SheetContent>
	</Sheet>
);

export default function Home() {
	const session = useSession();

	return (
		<View className="gap-4 p-6">
			{session && <Households userId={session.user.id} />}
			<SyncStatusSheet />
			<Button
				onPress={() => void supabase.auth.signOut()}
				variant="secondary"
			>
				Sign out
			</Button>
		</View>
	);
}
