import { QuickAdd } from "@/features/entries/quick-add";
import { useFillHouseholdTimeZone } from "@/features/households/use-fill-household-time-zone";
import { useAppBadge } from "@/features/notifications/use-app-badge";
import { usePush } from "@/features/notifications/use-push";
import { useAutoRecord } from "@/features/recurring/use-auto-record";
import { TabsLayout } from "@/features/shell/tabs-layout";
import { useSignedInUserId } from "@/lib/session";

export default function Tabs() {
	const userId = useSignedInUserId();
	useFillHouseholdTimeZone(userId);
	useAutoRecord();
	usePush();
	useAppBadge(userId);
	return <TabsLayout quickAdd={(close) => <QuickAdd onDone={close} />} />;
}
