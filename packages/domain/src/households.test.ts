import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	BUDGET_MONTH_START_DAYS,
	isTimeZone,
	parseBudgetMonthStartDay,
} from "./households";

describe("parseBudgetMonthStartDay", () => {
	it("takes every day from the 1st to the 28th, as typed", () => {
		fc.assert(
			fc.property(
				fc.integer({
					min: BUDGET_MONTH_START_DAYS.first,
					max: BUDGET_MONTH_START_DAYS.last,
				}),
				fc.constantFrom("", " "),
				(day, pad) => {
					expect(parseBudgetMonthStartDay(`${pad}${day}${pad}`)).toBe(day);
				},
			),
		);
	});

	it("refuses days some months don't have, and anything not a whole day", () => {
		fc.assert(
			fc.property(
				fc.oneof(
					fc.integer({ min: 29, max: 1000 }).map(String),
					fc.integer({ min: -1000, max: 0 }).map(String),
					fc.double({ noInteger: true }).map(String),
					fc.string().filter((s) => !/^\s*\d+\s*$/.test(s)),
				),
				(text) => {
					expect(parseBudgetMonthStartDay(text)).toBeNull();
				},
			),
		);
	});
});

describe("isTimeZone", () => {
	it("refuses empty names and names with space around them", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("Asia/Karachi", "UTC", ""),
				fc.constantFrom(" ", "\t", "\n"),
				fc.boolean(),
				(name, space, before) => {
					expect(
						isTimeZone(before ? `${space}${name}` : `${name}${space}`),
					).toBe(false);
				},
			),
		);
		expect(isTimeZone("")).toBe(false);
	});

	it("refuses names no runtime knows", () => {
		fc.assert(
			fc.property(
				fc.stringMatching(/^[A-Z][a-z]{3,8}\/Nowhere[a-z]{0,4}$/),
				(name) => {
					expect(isTimeZone(name)).toBe(false);
				},
			),
		);
	});

	it("knows IANA timezones and nothing else", () => {
		expect(isTimeZone("Asia/Karachi")).toBe(true);
		expect(isTimeZone("UTC")).toBe(true);
		expect(isTimeZone("Mars/Olympus")).toBe(false);
		expect(isTimeZone(" Asia/Karachi")).toBe(false);
		expect(isTimeZone("")).toBe(false);
	});
});
