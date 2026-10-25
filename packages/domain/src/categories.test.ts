import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	archivedCategories,
	type CategoryLike,
	categoryTree,
	parentChoices,
} from "./categories";

// A household's Categories: two lists, one level of Subcategories, archived ones kept apart (spec §3.3).

const kind = fc.constantFrom("expense" as const, "income" as const);

/** A well-formed household: Subcategories point at a top-level Category of their own list. */
const categories = fc
	.uniqueArray(
		fc.record({
			id: fc.uuid(),
			kind,
			name: fc.string({ minLength: 1, maxLength: 12 }),
			archived: fc.boolean(),
			parentPick: fc.option(fc.nat(), { nil: null }),
		}),
		{ selector: (c) => c.id, maxLength: 30 },
	)
	.map((drafts) => {
		const tops = drafts.filter((d) => d.parentPick === null);
		return drafts.map(({ id, kind, name, archived, parentPick }) => {
			const siblings = tops.filter((t) => t.kind === kind && t.id !== id);
			const parent =
				parentPick === null || siblings.length === 0
					? null
					: siblings[parentPick % siblings.length];
			return {
				id,
				kind,
				name,
				parent_id: parent?.id ?? null,
				archived_at: archived ? "2026-10-26T00:00:00.000Z" : null,
			} satisfies CategoryLike;
		});
	});

const byId = (list: readonly CategoryLike[]) =>
	new Map(list.map((c) => [c.id, c]));

describe("categoryTree", () => {
	it("lists each active top-level Category of the list once, by name", () => {
		fc.assert(
			fc.property(categories, kind, (list, k) => {
				const tree = categoryTree(list, k);
				const expected = list.filter(
					(c) => c.kind === k && c.parent_id === null && c.archived_at === null,
				);
				expect(tree.map((n) => n.category.id).sort()).toEqual(
					expected.map((c) => c.id).sort(),
				);
				const names = tree.map((n) => n.category.name);
				expect(names).toEqual(names.toSorted((a, b) => a.localeCompare(b)));
			}),
		);
	});

	it("puts every active Subcategory under its own parent, and only there", () => {
		fc.assert(
			fc.property(categories, kind, (list, k) => {
				const tree = categoryTree(list, k);
				for (const { category, subcategories } of tree) {
					for (const sub of subcategories) {
						expect(sub.parent_id).toBe(category.id);
						expect(sub.archived_at).toBeNull();
					}
				}
				const shown = new Set(
					tree.flatMap((n) => n.subcategories.map((s) => s.id)),
				);
				const index = byId(list);
				for (const c of list) {
					const parent = c.parent_id === null ? null : index.get(c.parent_id);
					const visible =
						c.kind === k &&
						parent !== null &&
						parent?.archived_at === null &&
						c.archived_at === null;
					expect(shown.has(c.id)).toBe(visible);
				}
			}),
		);
	});
});

describe("archivedCategories", () => {
	it("lists exactly the list's archived Categories, each with its parent", () => {
		fc.assert(
			fc.property(categories, kind, (list, k) => {
				const archived = archivedCategories(list, k);
				expect(archived.map((a) => a.category.id).sort()).toEqual(
					list
						.filter((c) => c.kind === k && c.archived_at !== null)
						.map((c) => c.id)
						.sort(),
				);
				for (const { category, parent } of archived)
					expect(parent?.id ?? null).toBe(category.parent_id);
			}),
		);
	});
});

describe("parentChoices", () => {
	it("offers the active top-level Categories of the same list, never the Category itself", () => {
		fc.assert(
			fc.property(categories, kind, fc.nat(), (list, k, pick) => {
				const category = list[pick % Math.max(list.length, 1)] ?? null;
				const listKind = category?.kind ?? k;
				const choices = parentChoices(list, listKind, category?.id ?? null);
				const hasSubcategories = list.some(
					(c) => category !== null && c.parent_id === category.id,
				);
				const expected = hasSubcategories
					? []
					: list.filter(
							(c) =>
								c.kind === listKind &&
								c.parent_id === null &&
								c.archived_at === null &&
								c.id !== category?.id,
						);
				expect(choices.map((c) => c.id).sort()).toEqual(
					expected.map((c) => c.id).sort(),
				);
			}),
		);
	});
});
