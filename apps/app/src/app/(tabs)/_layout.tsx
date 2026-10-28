import { QuickAdd } from "@/features/entries/quick-add";
import { useFillHouseholdTimeZone } from "@/features/households/use-fill-household-time-zone";
import { usePush } from "@/features/notifications/use-push";
import { useAutoRecord } from "@/features/recurring/use-auto-record";
import { TabsLayout } from "@/features/shell/tabs-layout";
import { useSignedInUserId } from "@/lib/session";

export default function Tabs() {
	useFillHouseholdTimeZone(useSignedInUserId());
	useAutoRecord();
	usePush();
	return <TabsLayout quickAdd={(close) => <QuickAdd onDone={close} />} />;
}
