import { describe, expect, it } from "@jest/globals";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CATEGORY_ICONS } from "@/components/ui/icon";
import { CATEGORY_COLORS } from "@/theme/tokens";

// The built-in template lives in a migration; its icon and colour keys must be ones the app can draw, or every new
// household would show the fallbacks.

const MIGRATIONS = join(__dirname, "../../../../../supabase/migrations");

const templateRows = () =>
	readdirSync(MIGRATIONS)
		.map((file) => readFileSync(join(MIGRATIONS, file), "utf8"))
		.filter((sql) => sql.includes("insert into private.category_template"))
		.flatMap((sql) => [
			...sql.matchAll(
				/\('(\w+)', (?:null|'\w+'), '(?:expense|income)', '[^']+', '(\w+)', '(\w+)'\)/g,
			),
		])
		.map(([, key, icon, color]) => ({ key, icon, color }));

describe("the built-in Category template", () => {
	it("is found", () => {
		expect(templateRows().length).toBeGreaterThan(0);
	});

	it.each(templateRows())(
		"$key uses a known icon and colour",
		({ icon, color }) => {
			expect(Object.keys(CATEGORY_ICONS)).toContain(icon);
			expect(Object.keys(CATEGORY_COLORS)).toContain(color);
		},
	);
});
