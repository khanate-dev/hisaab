import { CONTRACT_VERSION } from "@hisaab/domain";

/** PowerSync's per-op metadata column: whatever a write puts here travels with the queued op, never as data. */
export const STAMP_COLUMN = "_metadata";

type Stamp = { contractVersion: number };

/** Adds the contract version to the values of an insert or update, so an older queued op can be upcast later. */
export const stamped = <Values extends object>(
	values: Values,
	contractVersion = CONTRACT_VERSION,
) => ({
	...values,
	[STAMP_COLUMN]: JSON.stringify({ contractVersion } satisfies Stamp),
});

/** The contract version a queued op was written under, or null when it carries no (readable) stamp. */
export const readStamp = (
	metadata: string | undefined | null,
): number | null => {
	if (!metadata) return null;
	try {
		const { contractVersion } = JSON.parse(metadata) as Partial<Stamp>;
		return typeof contractVersion === "number" &&
			Number.isInteger(contractVersion) &&
			contractVersion >= 1
			? contractVersion
			: null;
	} catch {
		return null;
	}
};
