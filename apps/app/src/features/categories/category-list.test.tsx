import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import { ArchivedCategoryList, CategoryList } from "./category-list";
import type { Category } from "./types";

const category = (
	id: string,
	name: string,
	parent_id: string | null = null,
): Category => ({
	id,
	household_id: "h1",
	kind: "expense",
	parent_id,
	name,
	icon: "groceries",
	color: "butter",
	archived_at: null,
	created_at: "2026-10-26T00:00:00.000Z",
	_metadata: null,
});

const food = category("c1", "Food");
const groceries = category("c2", "Groceries", "c1");
const travel = category("c3", "Travel");

describe("CategoryList", () => {
	it("shows each Category with its Subcategories beneath it", async () => {
		await render(
			<CategoryList
				tree={[
					{ category: food, subcategories: [groceries] },
					{ category: travel, subcategories: [] },
				]}
			/>,
		);
		expect(screen.getByLabelText("Food")).toBeOnTheScreen();
		expect(screen.getByLabelText("Groceries, in Food")).toBeOnTheScreen();
		expect(screen.getByLabelText("Travel")).toBeOnTheScreen();
	});

	it("opens a Category or Subcategory when it can be edited", async () => {
		const onOpen = jest.fn();
		await render(
			<CategoryList
				onOpen={onOpen}
				tree={[{ category: food, subcategories: [groceries] }]}
			/>,
		);
		await userEvent.press(
			screen.getByRole("button", { name: "Groceries, in Food" }),
		);
		expect(onOpen).toHaveBeenCalledWith("c2");
	});

	it("offers nothing to press when read-only", async () => {
		await render(
			<CategoryList tree={[{ category: food, subcategories: [groceries] }]} />,
		);
		expect(screen.queryByRole("button")).toBeNull();
	});

	it("says when the list is empty", async () => {
		await render(<CategoryList tree={[]} />);
		expect(screen.getByRole("status")).toHaveTextContent(/no categories/i);
	});
});

describe("ArchivedCategoryList", () => {
	it("says which Category an archived Subcategory was under", async () => {
		await render(
			<ArchivedCategoryList
				items={[{ category: { ...groceries, archived_at: "x" }, parent: food }]}
			/>,
		);
		expect(screen.getByLabelText("Groceries, under Food")).toHaveTextContent(
			/under food/i,
		);
	});
});
