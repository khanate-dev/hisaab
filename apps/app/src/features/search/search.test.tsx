import { describe, expect, it, jest } from "@jest/globals";
import { type EntryFilter, NO_FILTER, parseMoney } from "@hisaab/domain";
import { PortalHost } from "@rn-primitives/portal";
import { screen, userEvent } from "@testing-library/react-native";
import { useState } from "react";

import type { EntryView } from "@/features/entries/views";
import { makeCategory } from "@/test/categories";
import { makeEntry } from "@/test/entries";
import { render } from "@/test/render";

import { EntrySearch, type FilterChoices } from "./entry-search";
import { toSearchable } from "./searchable";

const choices: FilterChoices = {
	kinds: [
		{ value: "expense", label: "Expense" },
		{ value: "income", label: "Income" },
	],
	wallets: [
		{ value: "w1", label: "Cash" },
		{ value: "w2", label: "HBL" },
	],
	categories: [{ value: "c1", label: "Food" }],
	currencies: [{ value: "PKR", label: "PKR" }],
	contacts: [{ value: "k1", label: "Ali" }],
	members: [{ value: "u1", label: "Ayesha" }],
};

/** EntrySearch as the Entries tab holds it: its filter in state, every change reported. */
const Harness = ({
	onFilter,
	onSave,
	onDeleteSaved,
	saved = [],
}: {
	onFilter: (filter: EntryFilter) => void;
	onSave: (name: string) => Promise<void>;
	onDeleteSaved: (id: string) => Promise<void>;
	saved?: { id: string; name: string; filter: EntryFilter }[];
}) => {
	const [filter, setFilter] = useState(NO_FILTER);
	return (
		<>
			<EntrySearch
				choices={choices}
				filter={filter}
				onChange={(next) => {
					setFilter(next);
					onFilter(next);
				}}
				onDeleteSaved={onDeleteSaved}
				onSave={onSave}
				saved={saved}
				shown={2}
				startDay={1}
				today="2026-10-28"
				total={7}
			/>
			<PortalHost />
		</>
	);
};

const setup = async (
	saved: { id: string; name: string; filter: EntryFilter }[] = [],
) => {
	const handlers = {
		onFilter: jest.fn((_f: EntryFilter) => {}),
		onSave: jest.fn(async (_name: string) => {}),
		onDeleteSaved: jest.fn(async (_id: string) => {}),
	};
	await render(
		<Harness
			{...handlers}
			saved={saved}
		/>,
	);
	return { ...handlers, user: userEvent.setup() };
};

describe("EntrySearch", () => {
	it("searches free text and amounts, and says how many match", async () => {
		const { onFilter, user } = await setup();
		await user.type(screen.getByLabelText("Search Entries"), ">2000");
		expect(onFilter).toHaveBeenLastCalledWith({ ...NO_FILTER, query: ">2000" });
		expect(screen.getByRole("status")).toHaveTextContent("2 of 7 Entries");
	});

	it("narrows by the filter set in a sheet", async () => {
		const { onFilter, user } = await setup();
		await user.press(screen.getByRole("button", { name: "Filters" }));
		await user.press(screen.getByRole("checkbox", { name: "Income" }));
		await user.press(screen.getByRole("checkbox", { name: "HBL" }));
		await user.press(screen.getByRole("checkbox", { name: "Ayesha" }));
		await user.type(screen.getByLabelText("From"), "2026-10-01");
		expect(onFilter).toHaveBeenLastCalledWith({
			...NO_FILTER,
			kinds: ["income"],
			walletIds: ["w2"],
			memberIds: ["u1"],
			from: "2026-10-01",
		});
		await user.press(screen.getByRole("button", { name: "Close" }));
		expect(screen.getByRole("button", { name: "Filters (4)" })).toBeVisible();
		await user.press(screen.getByRole("button", { name: "Clear" }));
		expect(onFilter).toHaveBeenLastCalledWith(NO_FILTER);
	});

	it("sets the dates from a Budget-month preset, and filters by currency and Loan Contact", async () => {
		const { onFilter, user } = await setup();
		await user.press(screen.getByRole("button", { name: "Filters" }));
		await user.press(screen.getByRole("button", { name: "Last Budget month" }));
		expect(onFilter).toHaveBeenLastCalledWith({
			...NO_FILTER,
			from: "2026-09-01",
			to: "2026-09-30",
		});
		expect(screen.getByLabelText("From")).toHaveDisplayValue("2026-09-01");
		await user.press(screen.getByRole("checkbox", { name: "PKR" }));
		await user.press(screen.getByRole("checkbox", { name: "Ali" }));
		expect(onFilter).toHaveBeenLastCalledWith(
			expect.objectContaining({ currencies: ["PKR"], contactIds: ["k1"] }),
		);
	});

	it("stops filtering by a date while it's half typed", async () => {
		const { onFilter, user } = await setup();
		await user.press(screen.getByRole("button", { name: "Filters" }));
		await user.type(screen.getByLabelText("To"), "2026-10-3");
		expect(onFilter).toHaveBeenLastCalledWith(NO_FILTER);
		await user.type(screen.getByLabelText("To"), "1");
		expect(onFilter).toHaveBeenLastCalledWith({
			...NO_FILTER,
			to: "2026-10-31",
		});
	});

	it("saves a search under a name", async () => {
		const { onSave, user } = await setup();
		await user.type(screen.getByLabelText("Search Entries"), "rent");
		await user.press(screen.getByRole("button", { name: "Save this search" }));
		await user.press(screen.getByRole("button", { name: "Save filter" }));
		expect(screen.getByRole("alert")).toHaveTextContent(/1 to 60/);
		await user.type(screen.getByLabelText("Saved filter name"), "Rent");
		await user.press(screen.getByRole("button", { name: "Save filter" }));
		expect(onSave).toHaveBeenCalledWith("Rent");
	});

	it("uses or deletes a Saved filter", async () => {
		const big = { ...NO_FILTER, query: ">5000", kinds: ["expense"] };
		const { onFilter, onDeleteSaved, user } = await setup([
			{ id: "s1", name: "Big", filter: big },
		]);
		await user.press(
			screen.getByRole("button", { name: "Use the Big filter" }),
		);
		expect(onFilter).toHaveBeenLastCalledWith(big);
		expect(screen.getByLabelText("Search Entries")).toHaveDisplayValue(">5000");
		await user.press(
			screen.getByRole("button", { name: "Delete the Big filter" }),
		);
		expect(onDeleteSaved).toHaveBeenCalledWith("s1");
	});
});

describe("toSearchable", () => {
	it("reads an itemized Expense's names, Wallet, Categories with parents, and every amount", () => {
		const food = makeCategory("c1", "Food");
		const groceries = makeCategory("c2", "Groceries", { parent_id: "c1" });
		const household = makeCategory("c3", "Household");
		const view: EntryView = {
			entry: makeEntry("e1", {
				description: "Weekly shop",
				notes: "Two bags",
				category_id: "c2",
			}),
			amount: parseMoney("-2500", "PKR"),
			wallet: { id: "w1", name: "Cash", currency: "PKR", archived_at: null },
			arrival: null,
			category: groceries,
			parent: food,
			items: [
				{
					item: {
						id: "i1",
						household_id: "h1",
						entry_id: "e1",
						position: 0,
						description: "Soap",
						amount: "300",
						quantity: null,
						category_id: "c3",
						rest: false,
						created_at: "2026-10-20T10:00:00.000Z",
						_metadata: null,
						_deleted: null,
					},
					amount: parseMoney("300", "PKR"),
					category: household,
				},
			],
			madeBy: "Ayesha",
		};
		const s = toSearchable(
			view,
			"Weekly shop",
			new Map([
				["c2", "c1"],
				["c3", null],
			]),
			new Map(),
		);
		expect(s.walletIds).toEqual(["w1"]);
		expect(s.categoryIds).toEqual(["c2", "c1", "c3"]);
		expect(s.text).toEqual(
			expect.arrayContaining([
				"Weekly shop",
				"Two bags",
				"Groceries",
				"Food",
				"Cash",
				"Soap",
				"Household",
			]),
		);
		expect(s.amounts.map((m) => m.toString())).toEqual(["-2500", "300"]);
		expect(s.currencies).toEqual(["PKR"]);
		const repayment = toSearchable(
			{
				...view,
				entry: { ...view.entry, kind: "repayment", loan_id: "l1" },
				items: [],
			},
			"Repayment",
			new Map(),
			new Map([["l1", { id: "k1", name: "Ali" }]]),
		);
		expect(repayment.contactIds).toEqual(["k1"]);
		expect(repayment.text).toContain("Ali");
	});
});
