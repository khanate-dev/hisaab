import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { EntryList } from "@/features/entries/entry-list";
import { useEntryViews } from "@/features/entries/use-entries";
import { useCanWrite } from "@/features/households/use-can-write";
import { useCurrentHousehold } from "@/features/households/use-current-household";
import { Screen } from "@/features/shell/screen";
import { useSignedInUserId } from "@/lib/session";

export default function Entries() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const household = useCurrentHousehold(userId);
	const views = useEntryViews(household?.id);
	const canWrite = useCanWrite(household?.id, userId) === true;

	return (
		<Screen title={t`Entries`}>
			{canWrite && (
				<View className="flex-row flex-wrap gap-3">
					<Button onPress={() => router.push("/entries/new?kind=expense")}>
						{t`Add Expense`}
					</Button>
					<Button
						onPress={() => router.push("/entries/new?kind=income")}
						variant="secondary"
					>
						{t`Add Income`}
					</Button>
					<Button
						onPress={() => router.push("/entries/new?kind=transfer")}
						variant="secondary"
					>
						{t`Add Transfer`}
					</Button>
				</View>
			)}
			{views !== undefined && (
				<EntryList
					items={views}
					onOpen={(id) => router.push(`/entries/${id}`)}
				/>
			)}
		</Screen>
	);
}
