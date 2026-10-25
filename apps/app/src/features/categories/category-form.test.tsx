import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import { CategoryForm } from "./category-form";
import type { Category, CategoryDraft } from "./types";

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
	color: "lime",
	archived_at: null,
	created_at: "2026-10-26T00:00:00.000Z",
	_metadata: null,
});

const food = category("c1", "Food");
const groceries = category("c2", "Groceries", "c1");
const travel = category("c3", "Travel");
const household = [food, groceries, travel];

const setup = async (props: Partial<Parameters<typeof CategoryForm>[0]>) => {
	const onSubmit = jest.fn(async (_draft: CategoryDraft) => {});
	await render(
		<CategoryForm
			categories={household}
			kind="expense"
			onSubmit={onSubmit}
			submitLabel="Save"
			{...props}
		/>,
	);
	return { onSubmit };
};

describe("CategoryForm", () => {
	it("adds a Category with its name, icon and colour", async () => {
		const { onSubmit } = await setup({});
		await userEvent.type(screen.getByLabelText("Name"), " Pets ");
		await userEvent.press(screen.getByRole("radio", { name: "Heartbeat" }));
		await userEvent.press(screen.getByRole("radio", { name: "Violet" }));
		await userEvent.press(screen.getByRole("button", { name: /save/i }));

		expect(onSubmit).toHaveBeenCalledWith({
			name: "Pets",
			icon: "health",
			color: "violet",
			parentId: null,
		});
	});

	it("starts a new Subcategory under its parent, in its parent's look", async () => {
		const { onSubmit } = await setup({ parentId: "c1" });
		expect(screen.getByRole("radio", { name: "Food" })).toBeChecked();
		await userEvent.type(screen.getByLabelText("Name"), "Takeaway");
		await userEvent.press(screen.getByRole("radio", { name: "Lime" }));
		await userEvent.press(screen.getByRole("button", { name: /save/i }));

		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({ parentId: "c1", icon: "groceries" }),
		);
	});

	it("only offers top-level Categories to sit under, never itself", async () => {
		await setup({ category: travel });
		expect(
			screen.getByRole("radio", { name: /top-level category/i }),
		).toBeChecked();
		expect(screen.getByRole("radio", { name: "Food" })).toBeOnTheScreen();
		expect(screen.queryByRole("radio", { name: "Travel" })).toBeNull();
		expect(screen.queryByRole("radio", { name: "Groceries" })).toBeNull();
	});

	it("still shows where a Subcategory sits when its parent is archived", async () => {
		await setup({
			categories: [
				{ ...food, archived_at: "2026-10-26T00:00:00.000Z" },
				groceries,
				travel,
			],
			category: groceries,
		});
		expect(screen.getByRole("radio", { name: "Food" })).toBeChecked();
	});

	it("keeps a Category with Subcategories at the top level", async () => {
		await setup({ category: food });
		expect(
			screen.queryByRole("radio", { name: /top-level category/i }),
		).toBeNull();
	});

	it("asks for a name", async () => {
		const { onSubmit } = await setup({});
		await userEvent.press(screen.getByRole("button", { name: /save/i }));
		expect(screen.getByRole("alert")).toHaveTextContent(/name/i);
		expect(onSubmit).not.toHaveBeenCalled();
	});
});
