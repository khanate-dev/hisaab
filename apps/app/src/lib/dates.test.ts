import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { deviceTimeZone, entryTimeZone, todayIn } from "./dates";

describe("entryTimeZone", () => {
	it("is the household's once it's set", () => {
		expect(entryTimeZone({ timezone: "Asia/Karachi" })).toBe("Asia/Karachi");
	});

	it("is this device's until then", () => {
		expect(entryTimeZone({ timezone: null })).toBe(deviceTimeZone());
		expect(entryTimeZone(undefined)).toBe(deviceTimeZone());
	});
});

describe("todayIn", () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	it("is the date in that timezone, not on this device", () => {
		jest.useFakeTimers({ now: new Date("2026-10-26T20:00:00Z") }); // 01:00 on the 27th in Karachi
		expect(todayIn("Asia/Karachi")).toBe("2026-10-27");
		expect(todayIn("America/Los_Angeles")).toBe("2026-10-26");
	});
});
