import { describe, expect, it, jest } from "@jest/globals";
import { parseMoney } from "@hisaab/domain";
import { screen, userEvent } from "@testing-library/react-native";

import { formatMoney } from "@/lib/format";
import { render } from "@/test/render";

import { ActivityList } from "./activity-list";
import type { ActivityRow } from "@/lib/activity-log";

const row = (overrides: Partial<ActivityRow>): ActivityRow => ({
	id: "a1",
	table_name: "entries",
	row_id: "e1",
	action: "insert",
	actor_id: "u1",
	device_time: null,
	synced_at: "2026-10-26T13:30:00.000Z",
	before: null,
	after: { kind: "expense", description: "Bread", amount: "-120" },
	...overrides,
});

const setup = async (
	rows: ActivityRow[],
	restorable: (row: ActivityRow) => boolean = () => false,
) => {
	const onRestore = jest.fn();
	await render(
		<ActivityList
			lookup={{
				wallets: new Map([["w1", { name: "Cash", currency: "PKR" }]]),
				categories: new Map([["c2", "Groceries"]]),
				baseCurrency: "PKR",
			}}
			names={new Map([["u1", "Ayesha"]])}
			onRestore={onRestore}
			restorable={restorable}
			rows={rows}
		/>,
	);
	return { onRestore };
};

describe("ActivityList", () => {
	it("says who did what to which row", async () => {
		await setup([
			row({}),
			row({
				id: "a2",
				table_name: "wallets",
				action: "insert",
				after: { name: "Cash" },
				actor_id: null,
			}),
		]);
		expect(
			screen.getByLabelText("Ayesha added an Entry: Bread"),
		).toBeOnTheScreen();
		expect(
			screen.getByLabelText("Hisaab added a Wallet: Cash"),
		).toBeOnTheScreen();
	});

	it("shows what an edit changed, before and after", async () => {
		await setup([
			row({
				action: "update",
				before: {
					description: "Bread",
					notes: null,
					amount: "-120",
					wallet_id: "w1",
					category_id: "c2",
					created_at: "x",
				},
				after: {
					description: "Bread",
					notes: "Two loaves",
					amount: "-150",
					wallet_id: "w1",
					category_id: "c9",
					created_at: "y",
				},
			}),
		]);
		const item = screen.getByLabelText("Ayesha changed an Entry: Bread");
		expect(item).toHaveTextContent(/Notes: — → Two loaves/);
		const was = formatMoney(parseMoney("-120", "PKR"));
		const now = formatMoney(parseMoney("-150", "PKR"));
		// Intl's figures use non-breaking spaces: any space matches any whitespace.
		const loose = (text: string) =>
			new RegExp(
				text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/gu, "\\s+"),
				"u",
			);
		expect(item).toHaveTextContent(loose(`Amount: ${was} → ${now}`));
		expect(item).toHaveTextContent(
			/Category: Groceries → a Category since gone/,
		);
		expect(item).not.toHaveTextContent(/created_at|wallet_id/);
	});

	it("offers to restore a deleted Entry it can bring back", async () => {
		const deletion = row({
			action: "delete",
			before: { kind: "expense", description: "Bread" },
			after: null,
		});
		const { onRestore } = await setup([deletion], (r) => r === deletion);
		expect(
			screen.getByLabelText("Ayesha deleted an Entry: Bread"),
		).toBeOnTheScreen();
		await userEvent.press(screen.getByRole("button", { name: "Restore" }));
		expect(onRestore).toHaveBeenCalledWith(deletion);
	});

	it("says when nothing has changed", async () => {
		await setup([]);
		expect(screen.getByRole("status")).toHaveTextContent(
			/nothing has changed/i,
		);
	});
});
