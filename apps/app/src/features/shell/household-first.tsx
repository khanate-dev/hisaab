import { useLingui } from "@lingui/react/macro";
import { usePathname } from "expo-router";
import { type ReactNode, useState } from "react";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { setCurrentHousehold } from "@/features/households/actions";
import { HouseholdList } from "@/features/households/household-list";
import { useHouseholds } from "@/features/households/use-households";
import { useSignedInUserId } from "@/lib/session";

import { OVERVIEW_HREF } from "./sections";

/**
 * Quick-add over My overview (#53): every household is on screen there, so ＋ first asks which one the Entry goes in,
 * switches to it, then shows the form. Anywhere else, straight to the form.
 */
export const HouseholdFirst = ({ children }: { children: ReactNode }) => {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	const households = useHouseholds(userId);
	const asking = usePathname() === OVERVIEW_HREF;
	const [picked, setPicked] = useState(false);
	if (!asking || picked) return children;
	return (
		<View className="gap-3">
			<Text variant="label">{t`Which household is it for?`}</Text>
			<HouseholdList
				currentId={undefined}
				households={households}
				onPick={(id) => {
					void setCurrentHousehold(id).then(() => setPicked(true));
				}}
			/>
		</View>
	);
};
