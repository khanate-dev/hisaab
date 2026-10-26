import { useCategories } from "@/features/categories/use-categories";
import { useCanWrite } from "@/features/households/use-can-write";
import { useMembership } from "@/features/households/use-membership";
import { useCurrentHousehold } from "@/features/households/use-current-household";
import { useWalletRows } from "@/features/wallets/use-wallets";
import { useSignedInUserId } from "@/lib/session";

import { useEntries } from "./use-entries";

/**
 * Everything recording or editing an Entry needs, for the household on screen: undefined until it has all loaded,
 * so a form never starts from half the data.
 */
export const useEntryData = () => {
	const userId = useSignedInUserId();
	const household = useCurrentHousehold(userId);
	const canWrite = useCanWrite(household?.id, userId);
	const membership = useMembership(household?.id, userId);
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
	return {
		userId,
		household,
		canWrite,
		categories,
		history,
		wallets,
		/** The Member's own pick of Wallet for new Entries here, if any. */
		defaultWalletId: membership?.default_wallet_id ?? null,
	};
};
