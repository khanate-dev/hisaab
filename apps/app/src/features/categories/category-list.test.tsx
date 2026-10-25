import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";

import { makeCategory } from "@/test/categories";
import { render } from "@/test/render";

import { ArchivedCategoryList, CategoryList } from "./category-list";

const food = makeCategory("c1", "Food");
const groceries = makeCategory("c2", "Groceries", { parent_id: "c1" });
const travel = makeCategory("c3", "Travel");

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
