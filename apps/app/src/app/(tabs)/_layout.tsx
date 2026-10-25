import { useFillHouseholdTimeZone } from "@/features/households/use-fill-household-time-zone";
import { TabsLayout } from "@/features/shell/tabs-layout";
import { useSignedInUserId } from "@/lib/session";

export default function Tabs() {
	useFillHouseholdTimeZone(useSignedInUserId());
	return <TabsLayout />;
}
