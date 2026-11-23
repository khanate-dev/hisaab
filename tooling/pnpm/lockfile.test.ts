import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// #115: when pnpm resolves peers differently per importer, the app ends up with two copies of drizzle-orm or
// react-native, and its queries lose their types. pnpm-workspace.yaml keeps them single; this fails if they split.
const lockfile = readFileSync(
	new URL("../../pnpm-lock.yaml", import.meta.url),
	"utf8",
);

/** The distinct resolved copies (peer variants included) of a package in the lockfile's snapshots. */
const copies = (name: string) =>
	new Set(
		[...lockfile.matchAll(new RegExp(String.raw`^  '?${name}@[^:\s]+`, "gm"))]
			.map((m) => m[0].trim().replace(/^'/, ""))
			// Each resolved copy appears once under `packages:` (version only) and once under `snapshots:` (with peers).
			.filter((key) => key.includes("(")),
	);

/** The copy of drizzle-orm a workspace package resolves. */
const drizzleOf = (importer: string) => {
	const section = lockfile.slice(lockfile.indexOf(`\n  ${importer}:\n`));
	return /\n {6}drizzle-orm:\n {8}specifier: [^\n]+\n {8}version: ([^\n]+)/.exec(
		section,
	)?.[1];
};

describe("pnpm lockfile", () => {
	it.each(["drizzle-orm", "react-native"])(
		"holds a single copy of %s",
		(name) => {
			expect(copies(name).size).toBe(1);
		},
	);

	it("gives the app and client-schema the same drizzle-orm", () => {
		const app = drizzleOf("apps/app");
		expect(app).toBeDefined();
		expect(drizzleOf("packages/client-schema")).toBe(app);
	});
});
