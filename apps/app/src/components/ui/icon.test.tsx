import { describe, expect, it } from "@jest/globals";

import { CATEGORY_ICONS, categoryIcon, DEFAULT_CATEGORY_ICON } from "./icon";

describe("categoryIcon", () => {
	it("finds the icon for every registered key", () => {
		for (const [key, icon] of Object.entries(CATEGORY_ICONS))
			expect(categoryIcon(key)).toBe(icon);
	});

	it("falls back to the default icon for a key it doesn't know", () => {
		expect(categoryIcon("renamed-by-a-newer-build")).toBe(
			DEFAULT_CATEGORY_ICON,
		);
	});

	it("uses stable Hisaab keys, never Lucide names", () => {
		for (const key of Object.keys(CATEGORY_ICONS))
			expect(key).toMatch(/^[a-z]+(-[a-z]+)*$/);
	});
});
