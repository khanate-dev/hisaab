// ADR-0009: a queued op remembers the contract version it was written under; before upload it is upcast, one
// version at a time, to the shape this build speaks. Upcasters are pure and kept forever.

/** A queued local write: which row, what operation, and the values written (null for a delete). */
export type QueuedOp = {
	table: string;
	op: "PUT" | "PATCH" | "DELETE";
	id: string;
	data: Record<string, unknown> | null;
};

/** Upcasters keyed by the version they produce: entry N maps an op from N − 1 to N, or null when it can't. */
export type Upcasters = Readonly<
	Record<number, (op: QueuedOp) => QueuedOp | null>
>;

/** Empty while the contract is at version 1: then the chain is the identity. Each bump adds its step here. */
export const UPCASTERS: Upcasters = {};

/**
 * Maps an op written under contract version `from` to version `to`, step by step. Null means it can't be mapped
 * (a step is missing or refuses, or the op came from a newer build); the caller keeps it as a Rejected change.
 */
export const upcast = (
	op: QueuedOp,
	from: number,
	to: number,
	registry: Upcasters,
): QueuedOp | null => {
	if (from > to) return null;
	let current: QueuedOp | null = op;
	for (
		let version = from + 1;
		version <= to && current !== null;
		version += 1
	) {
		const step = registry[version];
		current = step ? step(current) : null;
	}
	return current;
};
