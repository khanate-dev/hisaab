import { describe, expect, it, jest } from "@jest/globals";
import {
	budgetVsActual,
	categoryTrend,
	incomeVsExpense,
	parseMoney,
	periodEnding,
	type ReportEntry,
	spendingByCategory,
} from "@hisaab/domain";
import { PortalHost } from "@rn-primitives/portal";
import { screen, userEvent } from "@testing-library/react-native";

import { formatBudgetMonth, formatMoney } from "@/lib/format";
import { makeCategory } from "@/test/categories";
import { render } from "@/test/render";

import {
	DEFAULT_SETTINGS,
	ReportControls,
	type ReportSettings,
} from "./report-controls";
import { BudgetVsActualReport } from "./budget-vs-actual";
import { CategoryTrendReport } from "./category-trend";
import { IncomeVsExpenseReport } from "./income-vs-expense";
import { SpendingByCategoryReport } from "./spending-by-category";

const categories = [
	makeCategory("food", "Food"),
	makeCategory("snacks", "Snacks", { parent_id: "food" }),
	makeCategory("fuel", "Fuel"),
];
const expense = (
	id: string,
	amount: string,
	category: string,
	occurredOn: string,
): ReportEntry => ({
	id,
	kind: "expense",
	amount: `-${amount}`,
	category_id: category,
	occurred_on: occurredOn,
	created_by: "u1",
});
const report = spendingByCategory({
	entries: [
		expense("e1", "300", "snacks", "2026-08-10"),
		expense("e2", "200", "food", "2026-08-11"),
		expense("e3", "100", "fuel", "2026-08-12"),
		expense("e4", "400", "food", "2026-07-12"),
	],
	items: [],
	categories,
	members: [],
	period: periodEnding("2026-08", 1, 1),
	startDay: 1,
	currency: "PKR",
});
const pkr = (amount: string) => formatMoney(parseMoney(amount, "PKR"));

describe("SpendingByCategoryReport", () => {
	it("shows the total and each Category against the previous period, most spent first", async () => {
		await render(
			<SpendingByCategoryReport
				comparison="previous"
				onDrillDown={() => {}}
				report={report}
				today="2026-09-15"
			/>,
		);
		expect(
			screen.getByRole("button", { name: "Total spent" }),
		).toHaveAccessibilityValue({
			text: `${pkr("600")}, ${pkr("200")} more`,
		});
		const rows = screen
			.getAllByRole("button")
			.map((row) => row.props.accessibilityLabel as string);
		expect(rows).toEqual(["Total spent", "Food", "Snacks", "Fuel"]);
		expect(
			screen.getByRole("button", { name: "Food" }),
		).toHaveAccessibilityValue({
			text: `${pkr("500")}, ${pkr("100")} more`,
		});
		expect(
			screen.getByLabelText("Total spent, compared"),
		).toHaveAccessibilityValue({
			text: `This period: ${pkr("600")}, Previous: ${pkr("400")}, 3-month avg.: ${pkr("133.33")}`,
		});
		expect(
			screen.getByLabelText("Spending by category"),
		).toHaveAccessibilityValue({
			text: `Food: ${pkr("500")}, Fuel: ${pkr("100")}`,
		});
	});

	it("opens the Entries a figure counts", async () => {
		const onDrillDown = jest.fn();
		const user = userEvent.setup();
		await render(
			<SpendingByCategoryReport
				comparison="average"
				onDrillDown={onDrillDown}
				report={report}
				today="2026-09-15"
			/>,
		);
		await user.press(screen.getByRole("button", { name: "Snacks" }));
		expect(onDrillDown).toHaveBeenLastCalledWith("snacks");
		await user.press(screen.getByRole("button", { name: "Total spent" }));
		expect(onDrillDown).toHaveBeenLastCalledWith();
	});
});

describe("SpendingByCategoryReport notes", () => {
	it("says a period running past today is so far, and counts Expenses not priced yet even with none counted", async () => {
		const unpriced = spendingByCategory({
			entries: [
				{
					...expense("e9", "10", "food", "2026-08-10"),
					base_amount: null,
					base_rate: "estimated",
				},
			],
			items: [],
			categories,
			members: [],
			period: periodEnding("2026-08", 1, 1),
			startDay: 1,
			currency: "PKR",
		});
		await render(
			<SpendingByCategoryReport
				comparison="previous"
				onDrillDown={() => {}}
				report={unpriced}
				today="2026-08-20"
			/>,
		);
		expect(screen.getByRole("status")).toHaveTextContent(
			"No Expenses in this period.",
		);
		expect(
			screen.getByText(/1 Entry in another currency isn't counted yet/),
		).toBeOnTheScreen();
	});

	it("says so when the period runs past today", async () => {
		await render(
			<SpendingByCategoryReport
				comparison="previous"
				onDrillDown={() => {}}
				report={report}
				today="2026-08-20"
			/>,
		);
		expect(
			screen.getByText("So far: the period runs past today."),
		).toBeOnTheScreen();
	});
});

describe("ReportControls", () => {
	it("changes the range and comparison in a sheet, and picks whose Entries count", async () => {
		const onChange = jest.fn((_settings: ReportSettings) => {});
		const user = userEvent.setup();
		await render(
			<>
				<ReportControls
					members={[
						{ userId: "u1", name: "Ayesha" },
						{ userId: "u2", name: "Bilal" },
					]}
					onChange={onChange}
					settings={DEFAULT_SETTINGS}
				/>
				<PortalHost />
			</>,
		);
		await user.press(
			screen.getByRole("button", {
				name: "This month, vs the previous period",
			}),
		);
		await user.press(
			await screen.findByRole("radio", { name: "Last 3 months" }),
		);
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ preset: "last_3_months" }),
		);
		await user.press(
			screen.getByRole("radio", { name: "vs the 3-month average" }),
		);
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ comparison: "average" }),
		);
		await user.press(screen.getByRole("checkbox", { name: "Bilal" }));
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ members: ["u2"] }),
		);
	});
});

const august = periodEnding("2026-08", 1, 1);
const monthStart = (month: string) => `${month}-01`;
const scope = {
	entries: [
		expense("e1", "300", "snacks", "2026-08-10"),
		expense("e2", "200", "food", "2026-08-11"),
		expense("e3", "100", "fuel", "2026-08-12"),
		{
			...expense("e5", "1000", "food", "2026-08-01"),
			kind: "income",
			amount: "1000",
			category_id: "salary",
		},
	],
	items: [],
	categories: [
		...categories,
		makeCategory("salary", "Salary", { kind: "income" }),
	],
	members: [],
	period: august,
	startDay: 1,
	currency: "PKR",
};

describe("BudgetVsActualReport", () => {
	it("shows each budgeted Category's spending against its Budget, ahead of pace or not, and drills down", async () => {
		const onDrillDown = jest.fn();
		const user = userEvent.setup();
		await render(
			<BudgetVsActualReport
				comparison="previous"
				onDrillDown={onDrillDown}
				report={budgetVsActual({
					...scope,
					standing: [
						{
							category_id: "food",
							valid_from: "2026-01",
							amount: "600",
							created_at: "a",
						},
						{
							category_id: "fuel",
							valid_from: "2026-01",
							amount: "1000",
							created_at: "a",
						},
					],
					overrides: [],
					today: "2026-08-10",
				})}
			/>,
		);
		expect(
			screen.getByRole("button", { name: "Food" }),
		).toHaveAccessibilityValue({
			text: `${pkr("500")} of ${pkr("600")}, 83%, ahead of pace, ${pkr("500")} more`,
		});
		expect(
			screen.getByRole("button", { name: "Fuel" }),
		).toHaveAccessibilityValue({
			text: `${pkr("100")} of ${pkr("1000")}, 10%, ${pkr("100")} more`,
		});
		await user.press(screen.getByRole("button", { name: "Fuel" }));
		expect(onDrillDown).toHaveBeenCalledWith(
			expect.objectContaining({ months: ["2026-08"] }),
		);
	});
});

describe("IncomeVsExpenseReport", () => {
	it("shows what came in, went out and was left, month by month, each opening its Entries", async () => {
		const onDrillDown = jest.fn();
		const user = userEvent.setup();
		await render(
			<IncomeVsExpenseReport
				comparison="previous"
				monthStart={monthStart}
				onDrillDown={onDrillDown}
				report={incomeVsExpense(scope)}
			/>,
		);
		expect(
			screen.getByRole("button", { name: "Came in" }),
		).toHaveAccessibilityValue({
			text: `${pkr("1000")}, ${pkr("1000")} more`,
		});
		expect(
			screen.getByRole("button", { name: "Left over" }),
		).toHaveAccessibilityValue({
			text: `${pkr("400")}, ${pkr("400")} more`,
		});
		await user.press(screen.getByRole("button", { name: "Went out" }));
		expect(onDrillDown).toHaveBeenLastCalledWith(["expense"]);
		const month = formatBudgetMonth("2026-08-01");
		await user.press(screen.getByRole("button", { name: `${month}, came in` }));
		expect(onDrillDown).toHaveBeenLastCalledWith(["income"], "2026-08");
		await user.press(screen.getByRole("button", { name: "Left over" }));
		expect(onDrillDown).toHaveBeenLastCalledWith(["income", "expense"]);
	});
});

describe("CategoryTrendReport", () => {
	it("follows the Category picked, month by month, each month opening its Entries", async () => {
		const onChoose = jest.fn();
		const onDrillDown = jest.fn();
		const user = userEvent.setup();
		const food = categories[0];
		if (!food) throw new Error("no food");
		await render(
			<CategoryTrendReport
				choices={[food]}
				chosen="food"
				comparison="average"
				monthStart={monthStart}
				onChoose={onChoose}
				onDrillDown={onDrillDown}
				report={categoryTrend({ ...scope, category: food })}
			/>,
		);
		expect(
			screen.getByRole("button", { name: "Total" }),
		).toHaveAccessibilityValue({
			text: `${pkr("500")}, ${pkr("500")} more`,
		});
		const month = formatBudgetMonth("2026-08-01");
		await user.press(screen.getByRole("button", { name: month }));
		expect(onDrillDown).toHaveBeenCalledWith("food", "2026-08");
	});
});
