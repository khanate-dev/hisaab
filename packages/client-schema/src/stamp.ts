import { CONTRACT_VERSION } from "@hisaab/domain";

/** PowerSync's per-op metadata column: whatever a write puts here travels with the queued op, never as data. */
export const STAMP_COLUMN = "_metadata";

/** PowerSync's delete flag: an update setting it (with a stamp) queues a DELETE that carries its stamp. */
export const DELETED_COLUMN = "_deleted";

type Stamp = { contractVersion: number; deviceTime?: string };

/**
 * Adds the contract version to the values of an insert or update, so an older queued op can be upcast later, and
 * when it was made on this device, for the Activity log.
 */
export const stamped = <Values extends object>(
	values: Values,
	contractVersion = CONTRACT_VERSION,
	now: Date = new Date(),
) => ({
	...values,
	[STAMP_COLUMN]: JSON.stringify({
		contractVersion,
		deviceTime: now.toISOString(),
	} satisfies Stamp),
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

/** When a queued op was made on its device, as an ISO timestamp; null when its stamp doesn't say. */
export const readStampTime = (
	metadata: string | undefined | null,
): string | null => {
	if (!metadata) return null;
	try {
		const { deviceTime } = JSON.parse(metadata) as Partial<Stamp>;
		return typeof deviceTime === "string" &&
			!Number.isNaN(Date.parse(deviceTime))
			? deviceTime
			: null;
	} catch {
		return null;
	}
};

/**
 * The values of a stamped delete: `db.update(table).set(stampedDelete()).where(...)` removes the row and queues a
 * DELETE carrying its stamp, so the Activity log knows when it happened on the device. A plain delete carries none.
 */
export const stampedDelete = (
	contractVersion = CONTRACT_VERSION,
	now: Date = new Date(),
) =>
	stamped(
		{ [DELETED_COLUMN]: true } as { _deleted: true },
		contractVersion,
		now,
	);
