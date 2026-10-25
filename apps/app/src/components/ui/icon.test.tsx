import { describe, expect, it } from "@jest/globals";

import { CATEGORY_ICONS, categoryIcon, DEFAULT_CATEGORY_ICON } from "./icon";

// Stored Categories reference these keys, so a key may be added but never renamed or removed (ADR-0008).
const SHIPPED_KEYS = [
	"groceries",
	"dining",
	"coffee",
	"transport",
	"car",
	"travel",
	"home",
	"utilities",
	"phone",
	"health",
	"education",
	"clothing",
	"children",
	"gifts",
	"repairs",
	"salary",
	"income",
];

describe("category icon registry", () => {
	it("keeps every key it has ever shipped", () => {
		expect(Object.keys(CATEGORY_ICONS)).toEqual(
			expect.arrayContaining(SHIPPED_KEYS),
		);
	});

	it("finds an icon for every shipped key", () => {
		for (const key of SHIPPED_KEYS)
			expect(categoryIcon(key)).not.toBe(DEFAULT_CATEGORY_ICON);
	});

	it.each(["renamed-by-a-newer-build", "toString", "__proto__", ""])(
		"falls back to the default icon for an unknown key: %j",
		(key) => {
			expect(categoryIcon(key)).toBe(DEFAULT_CATEGORY_ICON);
		},
	);

	it("uses kebab-case Hisaab keys", () => {
		for (const key of Object.keys(CATEGORY_ICONS))
			expect(key).toMatch(/^[a-z]+(-[a-z]+)*$/);
	});
});
