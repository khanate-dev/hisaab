import fc from "fast-check";

// The nightly fuzz run (#67): FC_NUM_RUNS raises every property's runs far past fast-check's default 100, and FC_SEED
// replays a run that failed. Unset, as in CI and locally, nothing changes.
// The domain has no Node types (it never runs I/O), so the environment is read untyped.
const env =
	(globalThis as { process?: { env: Record<string, string | undefined> } })
		.process?.env ?? {};
const integer = (name: string) => {
	const text = env[name];
	if (!text) return undefined;
	const value = Number(text);
	if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`);
	return value;
};
const numRuns = integer("FC_NUM_RUNS");
const seed = integer("FC_SEED");
if (numRuns !== undefined || seed !== undefined)
	fc.configureGlobal({
		...(numRuns !== undefined ? { numRuns } : {}),
		...(seed !== undefined ? { seed } : {}),
	});
