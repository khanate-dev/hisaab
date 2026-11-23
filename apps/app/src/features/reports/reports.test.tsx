import { describe, expect, it, jest } from "@jest/globals";
import {
	parseMoney,
	periodEnding,
	type ReportEntry,
	spendingByCategory,
} from "@hisaab/domain";
import { PortalHost } from "@rn-primitives/portal";
import { screen, userEvent } from "@testing-library/react-native";

import { formatMoney } from "@/lib/format";
import { makeCategory } from "@/test/categories";
import { render } from "@/test/render";

import {
	DEFAULT_SETTINGS,
	ReportControls,
	type ReportSettings,
} from "./report-controls";
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
			screen.getByText(/1 Expense in another currency isn't counted yet/),
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
