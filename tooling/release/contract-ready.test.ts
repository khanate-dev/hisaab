import { describe, expect, it } from "vitest";

import {
	contractStamp,
	missingRuntimes,
	stampedContract,
} from "./contract-ready";

// Shaped as eas-cli 24's `build:list --json` and `update:list --branch production --json` print them.
const build = (version: string) => ({
	platform: "ANDROID",
	status: "FINISHED",
	distribution: "STORE",
	updateChannel: { name: "production" },
	runtime: { id: "r", version },
});
const update = (runtimeVersion: string, message: string, extra = {}) => ({
	branch: "production",
	message: `"${message}" (2 days ago by robot)`,
	runtimeVersion,
	platforms: "android, ios",
	...extra,
});

describe("contract stamps", () => {
	it("reads back what it writes", () => {
		expect(stampedContract(`${contractStamp(4)} Budgets`)).toBe(4);
		expect(stampedContract("Budgets")).toBe(null);
	});
});

describe("missingRuntimes", () => {
	it("lets a raise through only when every live runtime has an update stamped at least that high", () => {
		const builds = [build("a1"), build("b2"), build("b2")];
		expect(
			missingRuntimes(
				builds,
				{
					currentPage: [
						update("a1", "[contract 3] Loans"),
						update("b2", "[contract 2] Older"),
					],
				},
				3,
			),
		).toEqual(["b2"]);
		expect(
			missingRuntimes(
				builds,
				{
					currentPage: [
						update("a1", "[contract 4] Later"),
						update("b2", "[contract 3] Loans"),
					],
				},
				3,
			),
		).toEqual([]);
	});

	it("never counts a roll back to the embedded build", () => {
		expect(
			missingRuntimes(
				[build("a1")],
				{
					currentPage: [
						update("a1", "[contract 3] Back", { isRollBackToEmbedded: true }),
					],
				},
				3,
			),
		).toEqual(["a1"]);
	});

	it("has nothing to strand with no store build yet", () => {
		expect(missingRuntimes([], { currentPage: [] }, 3)).toEqual([]);
	});
});
