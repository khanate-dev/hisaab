import { describe, expect, it, jest } from "@jest/globals";
import { PortalHost } from "@rn-primitives/portal";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import { CategoryActions } from "./category-actions";
import type { Category } from "./types";

const category = (
	id: string,
	name: string,
	parent_id: string | null = null,
	archived_at: string | null = null,
): Category => ({
	id,
	household_id: "h1",
	kind: "expense",
	parent_id,
	name,
	icon: "groceries",
	color: "lime",
	archived_at,
	created_at: "2026-10-26T00:00:00.000Z",
	_metadata: null,
});

const setup = async (
	props: Partial<Parameters<typeof CategoryActions>[0]> = {},
) => {
	const handlers = {
		onArchive: jest.fn(async () => {}),
		onUnarchive: jest.fn(async () => {}),
		onDelete: jest.fn(async () => {}),
	};
	await render(
		<>
			<CategoryActions
				category={category("c1", "Food")}
				inUse={false}
				parent={null}
				{...handlers}
				{...props}
			/>
			<PortalHost />
		</>,
	);
	return { ...handlers, user: userEvent.setup() };
};

describe("CategoryActions", () => {
	it("archives only after confirming", async () => {
		const { user, onArchive } = await setup({ inUse: true });
		await user.press(screen.getByRole("button", { name: "Archive" }));
		expect(onArchive).not.toHaveBeenCalled();
		expect(
			await screen.findByRole("heading", { name: /archive food\?/i }),
		).toBeOnTheScreen();
		await user.press(screen.getByRole("button", { name: "Archive Category" }));
		expect(onArchive).toHaveBeenCalled();
	});

	it("never offers to delete a Category in use", async () => {
		await setup({ inUse: true });
		expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
	});

	it("deletes an unused Category after confirming", async () => {
		const { user, onDelete } = await setup();
		await user.press(screen.getByRole("button", { name: "Delete" }));
		await screen.findByRole("heading", { name: /delete food\?/i });
		await user.press(screen.getByRole("button", { name: "Delete Category" }));
		expect(onDelete).toHaveBeenCalled();
	});

	it("brings an archived Category back", async () => {
		const { user, onUnarchive } = await setup({
			category: category("c1", "Food", null, "2026-10-26T00:00:00.000Z"),
		});
		await user.press(screen.getByRole("button", { name: "Unarchive" }));
		expect(onUnarchive).toHaveBeenCalled();
	});

	it("asks to bring an archived parent back before its Subcategory", async () => {
		const archivedAt = "2026-10-26T00:00:00.000Z";
		await setup({
			category: category("c2", "Groceries", "c1", archivedAt),
			parent: category("c1", "Food", null, archivedAt),
		});
		expect(screen.queryByRole("button", { name: "Unarchive" })).toBeNull();
		expect(screen.getByRole("note")).toHaveTextContent(/bring food back/i);
	});
});
