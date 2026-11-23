import { describe, expect, it } from "@jest/globals";
import { myOverview, reportPeriod } from "@hisaab/domain";
import { screen } from "@testing-library/react-native";

import { formatMoney } from "@/lib/format";
import { render } from "@/test/render";

import { MyOverview } from "./my-overview";

const TODAY = "2026-10-20";
const household = (id: string, currency: string, amount: string) => ({
	id,
	baseCurrency: currency,
	wallets: [{ id: `${id}-w`, currency }],
	entries: [
		{
			id: `${id}-e`,
			kind: "income",
			amount,
			category_id: null,
			occurred_on: "2026-10-05",
			created_by: "u1",
			wallet_id: `${id}-w`,
		},
	],
});
const overview = (households: ReturnType<typeof household>[]) =>
	myOverview({
		households,
		currency: "USD",
		period: reportPeriod("this_month", TODAY, 1),
		rates: [
			{ on_date: "2026-10-01", currency: "USD", per_usd: "1" },
			{ on_date: "2026-10-01", currency: "PKR", per_usd: "280" },
		],
		today: TODAY,
	});
const monthStart = (month: string) => `${month}-01`;

describe("MyOverview", () => {
	it("adds every household up in the display currency, approx. when another currency was converted", async () => {
		const report = overview([
			household("h1", "USD", "100"),
			household("h2", "PKR", "28000"),
		]);
		await render(
			<MyOverview
				comparison="previous"
				monthStart={monthStart}
				overview={report}
			/>,
		);
		const usd = formatMoney(report.worth.total);
		expect(screen.getByLabelText("Net worth")).toHaveAccessibilityValue({
			text: `approx. ${usd}, ${usd} more`,
		});
		expect(screen.getByText(/approximate/)).toBeOnTheScreen();
	});

	it("says the figures plainly when every Wallet is in the display currency", async () => {
		const report = overview([household("h1", "USD", "100")]);
		await render(
			<MyOverview
				comparison="previous"
				monthStart={monthStart}
				overview={report}
			/>,
		);
		const usd = formatMoney(report.flow.total.income);
		expect(screen.getByLabelText("Came in")).toHaveAccessibilityValue({
			text: `${usd}, ${usd} more`,
		});
		expect(screen.queryByText(/approximate/)).toBeNull();
	});
});
