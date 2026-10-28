import type { NotificationTrigger } from "./notifications";
import { nameBasedUuid } from "./recurring";

/** Hisaab's namespace for preference ids; fixed forever, as every device must derive the same ones. */
const PREFERENCE_NAMESPACE = "8a3c2f1e-5b7d-4e9a-a6c1-2d4f6b8e0a13";

/**
 * A notification preference's id, from its User, household and trigger: two devices choosing offline write the same
 * row, and the server checks it's this one (`keep_preference_origin`).
 */
export const preferenceId = (
	userId: string,
	householdId: string,
	trigger: NotificationTrigger,
) =>
	nameBasedUuid(
		PREFERENCE_NAMESPACE,
		`preference/${userId}/${householdId}/${trigger}`,
	);
