import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import { ContactList } from "./contact-list";
import type { Contact } from "./use-contacts";

const contact = (
	id: string,
	name: string,
	archived_at: string | null = null,
): Contact => ({
	id,
	household_id: "h1",
	name,
	archived_at,
	created_at: "2026-10-01T00:00:00.000Z",
	_metadata: null,
	_deleted: null,
});

const setup = async (canEdit = true) => {
	const onAdd = jest.fn(async (_name: string) => {});
	const onArchive = jest.fn(async (_id: string, _archived: boolean) => {});
	await render(
		<ContactList
			canEdit={canEdit}
			contacts={[
				contact("k1", "Ali"),
				contact("k2", "Sara", "2026-10-02T00:00:00.000Z"),
			]}
			onAdd={onAdd}
			onArchive={onArchive}
		/>,
	);
	return { onAdd, onArchive, user: userEvent.setup() };
};

describe("ContactList", () => {
	it("adds a Contact by name", async () => {
		const { onAdd, user } = await setup();
		await user.type(screen.getByLabelText("New Contact"), " Bilal ");
		await user.press(screen.getByRole("button", { name: "Add Contact" }));
		expect(onAdd).toHaveBeenCalledWith("Bilal");
	});

	it("archives and brings back Contacts", async () => {
		const { onArchive, user } = await setup();
		await user.press(screen.getByRole("button", { name: "Archive Ali" }));
		await user.press(screen.getByRole("button", { name: "Unarchive Sara" }));
		expect(onArchive).toHaveBeenNthCalledWith(1, "k1", true);
		expect(onArchive).toHaveBeenNthCalledWith(2, "k2", false);
	});

	it("is read-only for Viewers", async () => {
		await setup(false);
		expect(screen.queryByRole("button")).toBeNull();
	});
});
