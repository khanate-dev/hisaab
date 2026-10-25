import { useLingui } from "@lingui/react/macro";

import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { HouseholdList } from "@/features/households/household-list";
import { useHouseholds } from "@/features/households/use-households";
import { useSession } from "@/lib/session";

/** The household pill: shows the current household and opens the switcher sheet. */
export const HouseholdPill = () => {
	const { t } = useLingui();
	const userId = useSession()?.user.id ?? "";
	const households = useHouseholds(userId);
	// Until switching arrives (#40), the current household is the Personal one.
	const current =
		households.find((household) => household.isPersonal) ?? households[0];
	const name = current?.isPersonal
		? t`Personal`
		: (current?.name ?? t`Personal`);

	return (
		<Sheet>
			<SheetTrigger asChild>
				<Button
					accessibilityLabel={t`Switch household: ${name}`}
					className="min-h-10 rounded-full py-1"
					variant="accent"
				>
					{name}
				</Button>
			</SheetTrigger>
			<SheetContent>
				<SheetTitle>{t`Households`}</SheetTitle>
				<HouseholdList households={households} />
			</SheetContent>
		</Sheet>
	);
};
