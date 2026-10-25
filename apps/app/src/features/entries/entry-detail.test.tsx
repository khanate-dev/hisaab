import { describe, expect, it, jest } from "@jest/globals";
import { PortalHost } from "@rn-primitives/portal";
import { screen, userEvent } from "@testing-library/react-native";

import { makeCategory } from "@/test/categories";
import { makeEntry } from "@/test/entries";
import { render } from "@/test/render";

import { EntryDetail } from "./entry-detail";
import type { WalletChoice } from "./types";
import { toEntryViews } from "./views";

const wallets: WalletChoice[] = [
	{ id: "w1", name: "Cash", currency: "PKR", archived_at: null },
];
const categories = [
	makeCategory("c1", "Food"),
	makeCategory("c2", "Groceries", { parent_id: "c1" }),
];

const view = (overrides: Parameters<typeof makeEntry>[1] = {}) => {
	const [first] = toEntryViews(
		[makeEntry("e1", overrides)],
		categories,
		wallets,
	);
	if (!first) throw new Error("no view");
	return first;
};

const setup = async (
	props: Partial<Parameters<typeof EntryDetail>[0]> = {},
) => {
	const handlers = { onEdit: jest.fn(), onDelete: jest.fn(async () => {}) };
	await render(
		<>
			<EntryDetail
				canEdit
				recordedBy="Ayesha"
				view={view({
					description: "Bread",
					occurred_time: "18:30",
					notes: "Two loaves",
				})}
				{...handlers}
				{...props}
			/>
			<PortalHost />
		</>,
	);
	return { ...handlers, user: userEvent.setup() };
};

describe("EntryDetail", () => {
	it("shows how much, its Category, Wallet, date and time, notes and who recorded it", async () => {
		await setup();
		const value = (label: string) =>
			screen.getByLabelText(label).props.accessibilityValue?.text;
		expect(value("Expense")).toMatch(/PKR\s?-?450|-PKR\s?450/);
		expect(value("Category")).toBe("Food › Groceries");
		expect(value("Wallet")).toBe("Cash");
		expect(value("Date")).toMatch(/at 18:30/);
		expect(value("Notes")).toBe("Two loaves");
		expect(value("Recorded by")).toBe("Ayesha");
	});

	it("deletes only after confirming", async () => {
		const { user, onDelete } = await setup();
		await user.press(screen.getByRole("button", { name: "Delete" }));
		expect(onDelete).not.toHaveBeenCalled();
		await screen.findByRole("heading", { name: /delete bread\?/i });
		await user.press(screen.getByRole("button", { name: "Delete Entry" }));
		expect(onDelete).toHaveBeenCalled();
	});

	it("is read-only for Viewers", async () => {
		await setup({ canEdit: false });
		expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
	});

	it("offers no edit or delete for a Balance adjustment", async () => {
		await setup({
			view: view({
				kind: "balance_adjustment",
				category_id: null,
				amount: "500",
			}),
		});
		expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
	});
});
