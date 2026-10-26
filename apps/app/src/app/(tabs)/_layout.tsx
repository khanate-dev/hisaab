import { QuickAdd } from "@/features/entries/quick-add";
import { useFillHouseholdTimeZone } from "@/features/households/use-fill-household-time-zone";
import { TabsLayout } from "@/features/shell/tabs-layout";
import { useSignedInUserId } from "@/lib/session";

export default function Tabs() {
	useFillHouseholdTimeZone(useSignedInUserId());
	return <TabsLayout quickAdd={(close) => <QuickAdd onDone={close} />} />;
}
