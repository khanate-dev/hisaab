import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { setCurrentHousehold } from "@/features/households/actions";
import { HouseholdList } from "@/features/households/household-list";
import { useCurrentHousehold } from "@/features/households/use-current-household";
import { useHouseholds } from "@/features/households/use-households";
import { useSession } from "@/lib/session";
import { isPersonalHousehold } from "@/features/households/is-personal";

/** The household pill: shows the household on screen and opens the switcher sheet. */
export const HouseholdPill = () => {
	const { t } = useLingui();
	const userId = useSession()?.user.id ?? "";
	const households = useHouseholds(userId);
	const current = useCurrentHousehold(userId);
	const [open, setOpen] = useState(false);
	const name =
		current === undefined || isPersonalHousehold(current, userId)
			? t`Personal`
			: current.name;

	return (
		<Sheet
			onOpenChange={setOpen}
			open={open}
		>
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
				<HouseholdList
					currentId={current?.id}
					households={households}
					onPick={(id) => {
						setOpen(false);
						void setCurrentHousehold(id);
					}}
				/>
				<View className="flex-row flex-wrap gap-3">
					<SheetClose asChild>
						<Button
							onPress={() => router.push("/households/new")}
							variant="secondary"
						>
							{t`Create household`}
						</Button>
					</SheetClose>
					<SheetClose asChild>
						<Button
							onPress={() => router.push("/join")}
							variant="secondary"
						>
							{t`Join with link`}
						</Button>
					</SheetClose>
					<SheetClose asChild>
						<Button
							onPress={() => router.push("/household")}
							variant="secondary"
						>
							{t`Household settings`}
						</Button>
					</SheetClose>
				</View>
			</SheetContent>
		</Sheet>
	);
};
