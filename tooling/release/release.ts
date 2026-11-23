// The native release (ADR-0011; #66), as release.yml asks it:
//
//   node tooling/release/release.ts path <android.json> <ios.json> <builds.json>   → "ota" or "store"
//   node tooling/release/release.ts next <patch|minor|major> [tags...]             → the next "X.Y.Z"
//   node tooling/release/release.ts stamp                                          → "[contract N]"
//
// android.json and ios.json are `expo-updates runtimeversion:resolve --platform …` (with `runtimeVersion: { policy:
// "fingerprint" }` the runtime is the fingerprint); builds.json is `eas build:list --channel production --distribution
// store --status finished --json`. Only Node built-ins and the contract version, so it runs straight from a checkout.
import { readFileSync } from "node:fs";

import { CONTRACT_VERSION } from "../../packages/domain/src/contract-version.ts";
import { contractStamp } from "./contract-ready.ts";

type Platform = "ANDROID" | "IOS";
const PLATFORMS: readonly Platform[] = ["ANDROID", "IOS"];

/** Each platform's newest production store build's runtime, from `eas build:list --json`. */
export const latestRuntimes = (builds: unknown): Map<Platform, string> => {
	const newest = new Map<Platform, { at: string; runtime: string }>();
	for (const b of Array.isArray(builds) ? builds : []) {
		const { platform, createdAt, runtime } = (b ?? {}) as {
			platform?: unknown;
			createdAt?: unknown;
			runtime?: { version?: unknown };
		};
		const version = runtime?.version;
		if (
			(platform !== "ANDROID" && platform !== "IOS") ||
			typeof createdAt !== "string" ||
			typeof version !== "string"
		)
			continue;
		const seen = newest.get(platform);
		if (!seen || createdAt > seen.at)
			newest.set(platform, { at: createdAt, runtime: version });
	}
	return new Map([...newest].map(([p, { runtime }]) => [p, runtime]));
};

/**
 * Whether this commit ships as an OTA update or needs store builds: an update only when both platforms' newest store
 * builds run exactly this commit's runtime (its fingerprint), so nothing native changed since; otherwise store builds,
 * for both, to keep them on one version.
 */
export const releasePath = (
	local: Record<Platform, string>,
	builds: unknown,
): "ota" | "store" => {
	const live = latestRuntimes(builds);
	return PLATFORMS.every((p) => live.get(p) === local[p]) ? "ota" : "store";
};

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/;

/** The next version from the release tags (`vX.Y.Z`) and the bump asked for; from 0.0.0 when there are none. */
export const nextVersion = (
	tags: readonly string[],
	bump: "patch" | "minor" | "major",
) => {
	const versions = tags.flatMap((tag) => {
		const m = SEMVER.exec(tag.trim());
		return m ? [[Number(m[1]), Number(m[2]), Number(m[3])] as const] : [];
	});
	const order = (a: readonly number[], b: readonly number[]) =>
		(a[0] ?? 0) - (b[0] ?? 0) ||
		(a[1] ?? 0) - (b[1] ?? 0) ||
		(a[2] ?? 0) - (b[2] ?? 0);
	const [major, minor, patch] = versions.reduce<
		readonly [number, number, number]
	>((top, v) => (order(v, top) > 0 ? v : top), [0, 0, 0]);
	switch (bump) {
		case "major":
			return `${major + 1}.0.0`;
		case "minor":
			return `${major}.${minor + 1}.0`;
		case "patch":
			return `${major}.${minor}.${patch + 1}`;
	}
};

const runtimeOf = (file: string) => {
	const { runtimeVersion } = JSON.parse(readFileSync(file, "utf8")) as {
		runtimeVersion?: unknown;
	};
	if (typeof runtimeVersion !== "string")
		throw new Error(`No runtimeVersion in ${file}`);
	return runtimeVersion;
};

if (import.meta.main) {
	const [command, ...args] = process.argv.slice(2);
	if (command === "path" && args.length === 3) {
		const [android = "", ios = "", builds = ""] = args;
		console.log(
			releasePath(
				{ ANDROID: runtimeOf(android), IOS: runtimeOf(ios) },
				JSON.parse(readFileSync(builds, "utf8")),
			),
		);
	} else if (
		command === "next" &&
		(args[0] === "patch" || args[0] === "minor" || args[0] === "major")
	)
		console.log(nextVersion(args.slice(1), args[0]));
	else if (command === "stamp") console.log(contractStamp(CONTRACT_VERSION));
	else {
		console.error(
			"usage: release.ts path <android.json> <ios.json> <builds.json> | next <patch|minor|major> [tags...] | stamp",
		);
		process.exitCode = 2;
	}
}
