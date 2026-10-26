import { describe, expect, it, jest } from "@jest/globals";
import { parseMoney } from "@hisaab/domain";
import { PortalHost } from "@rn-primitives/portal";
import { screen, userEvent } from "@testing-library/react-native";

import { formatDate, formatMoney } from "@/lib/format";
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
		const has = (label: string, text: string) =>
			expect(screen.getByLabelText(label)).toHaveAccessibilityValue({ text });
		has("Expense", formatMoney(parseMoney("-450", "PKR")));
		has("Category", "Food › Groceries");
		has("Wallet", "Cash");
		has("Date", `${formatDate("2026-10-20")} at 18:30`);
		has("Notes", "Two loaves");
		has("Recorded by", "Ayesha");
	});

	it("lists an itemized Expense's Items with their Categories", async () => {
		const [itemized] = toEntryViews(
			[makeEntry("e1", { amount: "-450" })],
			categories,
			wallets,
			[
				{
					id: "i1",
					household_id: "h1",
					entry_id: "e1",
					position: 0,
					description: "Milk",
					amount: "120",
					quantity: "2 litres",
					category_id: "c2",
					rest: false,
					created_at: "2026-10-20T10:00:00.000Z",
					_metadata: null,
				},
			],
		);
		if (!itemized) throw new Error("no view");
		await setup({ view: itemized });
		expect(screen.getByLabelText("Milk × 2 litres")).toHaveAccessibilityValue({
			text: `Groceries, ${formatMoney(parseMoney("120", "PKR"))}`,
		});
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
