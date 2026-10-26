import { useCategories } from "@/features/categories/use-categories";
import { useCanWrite } from "@/features/households/use-can-write";
import { usePersonalHousehold } from "@/features/households/use-personal-household";
import { useWalletRows } from "@/features/wallets/use-wallets";
import { useSignedInUserId } from "@/lib/session";

import { useEntries } from "./use-entries";

/**
 * Everything recording or editing an Entry needs, for the household on screen: undefined until it has all loaded,
 * so a form never starts from half the data.
 */
export const useEntryData = () => {
	const userId = useSignedInUserId();
	const household = usePersonalHousehold(userId);
	const canWrite = useCanWrite(household?.id, userId);
	const categories = useCategories(household?.id);
	const history = useEntries(household?.id);
	const wallets = useWalletRows(household?.id);
	if (
		!household ||
		canWrite === undefined ||
		!categories ||
		!history ||
		!wallets
	)
		return undefined;
	return { userId, household, canWrite, categories, history, wallets };
};
