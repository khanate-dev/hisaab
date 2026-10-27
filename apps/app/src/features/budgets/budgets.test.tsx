import { describe, expect, it, jest } from "@jest/globals";
import { parseMoney } from "@hisaab/domain";
import { screen, userEvent, within } from "@testing-library/react-native";

import { formatMoney } from "@/lib/format";
import { makeCategory } from "@/test/categories";
import { makeEntry } from "@/test/entries";
import { render } from "@/test/render";

import type { BudgetScope } from "./scope";
import { BudgetMonth } from "./budget-month";
import { BudgetsTile } from "./budgets-tile";
import { budgetMonthView } from "./month-view";

const pkr = (amount: string) => formatMoney(parseMoney(amount, "PKR"));

const food = makeCategory("c1", "Food");
const groceries = makeCategory("c2", "Groceries", { parent_id: "c1" });
const transport = makeCategory("c3", "Transport");
const rent = makeCategory("c4", "Rent");
const salary = makeCategory("c5", "Salary", { kind: "income" });
const categories = [food, groceries, transport, rent, salary];

const standing = [
	{ category_id: "c1", valid_from: "2026-09", amount: "30000" },
	{ category_id: "c3", valid_from: "2026-10", amount: "10000" },
	{ category_id: "c4", valid_from: "2026-10", amount: "50000" },
	{ category_id: "c5", valid_from: "2026-01", amount: "250000" },
];
const overrides = [{ category_id: "c3", month: "2026-11", amount: "2000" }];

const entries = [
	// Groceries count towards Food, their parent.
	makeEntry("e1", {
		amount: "-12000",
		category_id: "c2",
		occurred_on: "2026-10-05",
	}),
	// An itemized Expense counts each Item against its own Category.
	makeEntry("e2", {
		amount: "-6000",
		category_id: "c1",
		occurred_on: "2026-10-08",
	}),
	makeEntry("e3", {
		kind: "balance_adjustment",
		amount: "-99999",
		category_id: null,
		occurred_on: "2026-10-09",
	}),
	makeEntry("e4", {
		amount: "-4000",
		category_id: "c3",
		occurred_on: "2026-09-30",
	}),
	makeEntry("e5", {
		kind: "income",
		amount: "250000",
		category_id: "c5",
		occurred_on: "2026-10-01",
	}),
];
const items = [
	{ entry_id: "e2", amount: "5000", category_id: "c3" },
	{ entry_id: "e2", amount: "1000", category_id: "c1" },
];

const october = (month = "2026-10", today = "2026-10-12") =>
	budgetMonthView({
		month,
		today,
		startDay: 1,
		currency: "PKR",
		categories,
		standing,
		overrides,
		entries,
		items,
	});

describe("budgetMonthView", () => {
	it("counts Items against their own Category, Subcategories in their parent, and no Balance adjustment", () => {
		const view = october();
		const used = Object.fromEntries(
			view.budgets.map((line) => [line.category.name, line.used.toString()]),
		);
		expect(used).toEqual({ Food: "13000", Transport: "5000", Rent: "0" });
		expect(view.expectedIncome.map((l) => l.used.toString())).toEqual([
			"250000",
		]);
	});

	it("uses a month's override, and the standing amount again after it", () => {
		const budgetOf = (month: string) =>
			budgetMonthView({ ...sources, month })
				.budgets.find((l) => l.category.name === "Transport")
				?.budget.toString();
		const sources = {
			today: "2026-10-12",
			startDay: 1,
			currency: "PKR",
			categories,
			standing,
			overrides,
			entries,
			items,
		};
		expect([
			budgetOf("2026-09"),
			budgetOf("2026-10"),
			budgetOf("2026-11"),
			budgetOf("2026-12"),
		]).toEqual([undefined, "10000", "2000", "10000"]);
	});
});

describe("BudgetMonth", () => {
	const setup = async (
		props: Partial<Parameters<typeof BudgetMonth>[0]> = {},
	) => {
		const handlers = {
			onPrevious: jest.fn(),
			onNext: jest.fn(),
			onSet: jest.fn(
				async (_c: {
					categoryId: string;
					amount: string;
					scope: BudgetScope;
				}) => {},
			),
			onStop: jest.fn(async (_categoryId: string) => {}),
		};
		await render(
			<BudgetMonth
				canEdit
				categories={categories}
				view={october()}
				{...handlers}
				{...props}
			/>,
		);
		return { ...handlers, user: userEvent.setup() };
	};

	it("shows each Budget with what's spent and its Pace", async () => {
		await setup();
		const foodLine = screen.getByLabelText("Food");
		expect(foodLine).toHaveAccessibilityValue({
			text: `${pkr("13000")} of ${pkr("30000")} spent, day 12 of 31, 43% spent`,
		});
		expect(screen.getAllByText("Spending ahead of the month")).toHaveLength(2);
		expect(screen.getByLabelText("Salary")).toHaveAccessibilityValue({
			text: `${pkr("250000")} of ${pkr("250000")} received, day 12 of 31, 100% received`,
		});
	});

	it("moves between Budget months", async () => {
		const { onPrevious, onNext, user } = await setup();
		await user.press(
			screen.getByRole("button", { name: "Previous Budget month" }),
		);
		await user.press(screen.getByRole("button", { name: "Next Budget month" }));
		expect(onPrevious).toHaveBeenCalledTimes(1);
		expect(onNext).toHaveBeenCalledTimes(1);
	});

	it("sets a new Budget from this month on", async () => {
		const { onSet, user } = await setup();
		await user.press(screen.getByRole("button", { name: "Set a Budget" }));
		await user.press(screen.getByRole("radio", { name: "Food: Groceries" }));
		await user.type(screen.getByLabelText("Budget (PKR)"), "15000");
		await user.press(screen.getByRole("button", { name: "Save Budget" }));
		expect(onSet).toHaveBeenCalledWith({
			categoryId: "c2",
			amount: "15000",
			scope: "onward",
		});
	});

	it("overrides a Budget for only this month", async () => {
		const { onSet, user } = await setup();
		await user.press(
			screen.getByRole("button", { name: "Change the Budget for Rent" }),
		);
		const amount = screen.getByLabelText("Budget (PKR)");
		await user.clear(amount);
		await user.type(amount, "55000");
		await user.press(screen.getByRole("radio", { name: /^Only / }));
		await user.press(screen.getByRole("button", { name: "Save Budget" }));
		expect(onSet).toHaveBeenCalledWith({
			categoryId: "c4",
			amount: "55000",
			scope: "month",
		});
	});

	it("stops a Budget from this month on", async () => {
		const { onStop, user } = await setup();
		await user.press(
			screen.getByRole("button", { name: "Change the Budget for Rent" }),
		);
		await user.press(screen.getByRole("button", { name: /^Stop from / }));
		expect(onStop).toHaveBeenCalledWith("c4");
	});

	it("asks for an amount of zero or more", async () => {
		const { onSet, user } = await setup();
		await user.press(
			screen.getByRole("button", { name: "Set Expected income" }),
		);
		await user.type(screen.getByLabelText("Expected income (PKR)"), "-5");
		await user.press(
			screen.getByRole("button", { name: "Save Expected income" }),
		);
		expect(screen.getByRole("alert")).toHaveTextContent(/zero or more/i);
		expect(onSet).not.toHaveBeenCalled();
	});

	it("lets a Viewer only look", async () => {
		await setup({ canEdit: false });
		expect(screen.queryByRole("button", { name: "Set a Budget" })).toBeNull();
		expect(screen.queryByRole("button", { name: /^Change / })).toBeNull();
	});

	it("says when a month has no Budgets", async () => {
		await setup({ view: october("2026-08", "2026-10-12") });
		expect(screen.getByText("No Budgets this month.")).toBeVisible();
		expect(screen.getByLabelText("Salary")).toHaveAccessibilityValue({
			text: `${pkr("0")} of ${pkr("250000")} received, 0% received`,
		});
	});
});

describe("BudgetsTile", () => {
	it("shows the three most-used Budgets and opens the Budgets tab", async () => {
		const onOpen = jest.fn();
		const lines = october().budgets;
		const rentLine = lines.find((l) => l.category.name === "Rent");
		if (!rentLine) throw new Error("Rent has a Budget");
		await render(
			<BudgetsTile
				budgets={[...lines, { ...rentLine, category: groceries }]}
				onOpen={onOpen}
			/>,
		);
		const tile = screen.getByRole("button", { name: /Budgets/ });
		expect(
			within(tile).getByText(`Food: ${pkr("13000")} of ${pkr("30000")}, 43%`),
		).toBeVisible();
		expect(
			within(tile).getByText(
				`Transport: ${pkr("5000")} of ${pkr("10000")}, 50%`,
			),
		).toBeVisible();
		expect(within(tile).queryAllByText(/^Rent|^Groceries/)).toHaveLength(1);
		await userEvent.setup().press(tile);
		expect(onOpen).toHaveBeenCalled();
	});

	it("isn't shown without a Budget", async () => {
		await render(
			<BudgetsTile
				budgets={[]}
				onOpen={() => {}}
			/>,
		);
		expect(screen.queryByText("Budgets")).toBeNull();
	});
});
