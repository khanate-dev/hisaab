import { useLingui } from "@lingui/react/macro";

import {
	createHousehold,
	setCurrentHousehold,
} from "@/features/households/actions";
import { HouseholdForm } from "@/features/households/household-form";
import { Screen } from "@/features/shell/screen";
import { deviceCurrency } from "@/lib/currency";
import { deviceTimeZone } from "@/lib/dates";
import { leaveTo } from "@/lib/navigation";
import { useSignedInUserId } from "@/lib/session";

export default function NewHousehold() {
	const { t } = useLingui();
	const userId = useSignedInUserId();
	return (
		<Screen title={t`New household`}>
			<HouseholdForm
				defaultCurrency={deviceCurrency()}
				defaultTimeZone={deviceTimeZone()}
				onSubmit={async (draft) => {
					const id = await createHousehold(userId, draft);
					await setCurrentHousehold(id);
					leaveTo("/");
				}}
			/>
		</Screen>
	);
}
