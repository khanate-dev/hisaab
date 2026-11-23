// Before a `min_contract_version` raise to N deploys (ADR-0011; #67): every runtime the production store builds run
// must already have an update on the `production` channel stamped with contract version ≥ N, so no installed build is
// left below the minimum with nothing to update to. Updates are stamped by starting their message with `[contract N]`
// (release.yml, #66).
//
//   node tooling/release/contract-ready.ts <N> <builds.json> <updates.json>
//
// builds.json is `eas build:list --channel production --distribution store --status finished --json`; updates.json is
// `eas update:list --branch production --json`. Only Node built-ins, so it runs straight from a checkout.
import { readFileSync } from "node:fs";

/** The stamp an update's message starts with. */
export const contractStamp = (version: number) => `[contract ${version}]`;

const STAMP = /\[contract (\d+)\]/;

/** The contract version an update's message carries, or null. */
export const stampedContract = (message: string): number | null => {
	const match = STAMP.exec(message);
	return match ? Number(match[1]) : null;
};

/** The runtimes the production store builds run, from `eas build:list --json`. */
export const liveRuntimes = (builds: unknown): string[] =>
	[
		...new Set(
			(Array.isArray(builds) ? builds : []).flatMap((b) => {
				const version = (b as { runtime?: { version?: unknown } })?.runtime
					?.version;
				return typeof version === "string" ? [version] : [];
			}),
		),
	].sort();

/** The runtimes with an update stamped ≥ the version, from `eas update:list --json`. */
export const coveredRuntimes = (
	updates: unknown,
	version: number,
): Set<string> => {
	const page = (updates as { currentPage?: unknown })?.currentPage;
	return new Set(
		(Array.isArray(page) ? page : []).flatMap((u) => {
			const { message, runtimeVersion, isRollBackToEmbedded } = (u ?? {}) as {
				message?: unknown;
				runtimeVersion?: unknown;
				isRollBackToEmbedded?: unknown;
			};
			const stamped =
				typeof message === "string" ? stampedContract(message) : null;
			return typeof runtimeVersion === "string" &&
				isRollBackToEmbedded !== true &&
				stamped !== null &&
				stamped >= version
				? [runtimeVersion]
				: [];
		}),
	);
};

/** The live runtimes still missing an update for the raise; empty means it may deploy. */
export const missingRuntimes = (
	builds: unknown,
	updates: unknown,
	version: number,
) => {
	const covered = coveredRuntimes(updates, version);
	return liveRuntimes(builds).filter((runtime) => !covered.has(runtime));
};

if (import.meta.main) {
	const [version, buildsFile, updatesFile] = process.argv.slice(2);
	if (!version || !buildsFile || !updatesFile) {
		console.error("usage: contract-ready.ts <N> <builds.json> <updates.json>");
		process.exitCode = 2;
	} else {
		const n = Number(version);
		const missing = missingRuntimes(
			JSON.parse(readFileSync(buildsFile, "utf8")),
			JSON.parse(readFileSync(updatesFile, "utf8")),
			n,
		);
		if (missing.length > 0) {
			console.log(
				`::error::Raising min_contract_version to ${n} would strand store builds: no ${contractStamp(n)} update on production for runtime ${missing.join(", ")}. Ship the update (release.yml) first.`,
			);
			process.exitCode = 1;
		} else console.log(`Every live runtime has a ${contractStamp(n)} update.`);
	}
}
