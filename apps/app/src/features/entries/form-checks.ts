import { isCalendarDate } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

/** The checks every Entry form shares: a real date, and a description and notes of a sensible length. */
export const useCommonChecks = () => {
	const { t } = useLingui();
	return ({
		occurredOn,
		description,
		notes,
		today,
	}: {
		occurredOn: string;
		description: string;
		notes: string;
		today: string;
	}): string | null => {
		if (!isCalendarDate(occurredOn.trim()))
			return t`Enter the date as YYYY-MM-DD, like ${today}.`;
		if (description.trim().length > 200)
			return t`Keep the description to 200 characters or fewer.`;
		if (notes.trim().length > 1000)
			return t`Keep the notes to 1000 characters or fewer.`;
		return null;
	};
};

/** A form's save: busy while it runs, and a plain message if the local write fails. */
export const useSave = () => {
	const { t } = useLingui();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const save = async (write: () => Promise<void>) => {
		setError(null);
		setBusy(true);
		try {
			await write();
		} catch {
			// A local write that fails is a bug, not something to explain; the message is the driver's, never copy.
			setError(t`That didn't save. Try again.`);
		} finally {
			setBusy(false);
		}
	};
	return { busy, error, setError, save };
};
