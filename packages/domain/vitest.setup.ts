import fc from "fast-check";

// The nightly fuzz run (#67): FC_NUM_RUNS raises every property's runs far past fast-check's default 100, and FC_SEED
// replays a run that failed. Unset, as in CI and locally, nothing changes.
// The domain has no Node types (it never runs I/O), so the environment is read untyped.
const env =
	(globalThis as { process?: { env: Record<string, string | undefined> } })
		.process?.env ?? {};
const runs = env["FC_NUM_RUNS"];
const seed = env["FC_SEED"];
if (runs || seed)
	fc.configureGlobal({
		...(runs ? { numRuns: Number(runs) } : {}),
		...(seed ? { seed: Number(seed) } : {}),
	});
