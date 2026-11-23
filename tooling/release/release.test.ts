import { describe, expect, it } from "vitest";

import { latestRuntimes, nextVersion, releasePath } from "./release";

// Shaped as eas-cli 24's `build:list --json` prints them.
const build = (
	platform: "ANDROID" | "IOS",
	version: string,
	createdAt: string,
) => ({
	platform,
	status: "FINISHED",
	distribution: "STORE",
	createdAt,
	updateChannel: { name: "production" },
	runtime: { id: "r", version },
});

describe("releasePath", () => {
	const local = { ANDROID: "fa", IOS: "fi" };

	it("ships an update when both platforms' newest store builds run this runtime", () => {
		expect(
			releasePath(local, [
				build("ANDROID", "old", "2026-10-01T00:00:00Z"),
				build("ANDROID", "fa", "2026-11-01T00:00:00Z"),
				build("IOS", "fi", "2026-11-02T00:00:00Z"),
			]),
		).toBe("ota");
	});

	it("builds for the stores when either platform's runtime changed, or has no store build yet", () => {
		expect(
			releasePath(local, [
				build("ANDROID", "fa", "2026-11-01T00:00:00Z"),
				build("IOS", "fi", "2026-10-01T00:00:00Z"),
				build("IOS", "newer", "2026-11-03T00:00:00Z"),
			]),
		).toBe("store");
		expect(
			releasePath(local, [build("ANDROID", "fa", "2026-11-01T00:00:00Z")]),
		).toBe("store");
		expect(releasePath(local, [])).toBe("store");
	});

	it("reads only well-formed builds", () => {
		expect(
			latestRuntimes([
				null,
				{ platform: "WEB" },
				build("IOS", "x", "2026-11-01"),
			]),
		).toEqual(new Map([["IOS", "x"]]));
	});
});

describe("nextVersion", () => {
	it("bumps the highest release tag, whatever their order", () => {
		const tags = ["v1.2.3", "v1.10.0", "v0.9.9", "not-a-release"];
		expect(nextVersion(tags, "patch")).toBe("1.10.1");
		expect(nextVersion(tags, "minor")).toBe("1.11.0");
		expect(nextVersion(tags, "major")).toBe("2.0.0");
		expect(nextVersion([], "minor")).toBe("0.1.0");
	});

	it("moves past every tag, a lower one listed last included", () => {
		expect(nextVersion(["v2.0.0", "v1.9.9"], "patch")).toBe("2.0.1");
		expect(nextVersion(["v0.0.9", "v0.1.0"], "patch")).toBe("0.1.1");
		expect(nextVersion(["1.4.0"], "minor")).toBe("1.5.0");
	});
});
