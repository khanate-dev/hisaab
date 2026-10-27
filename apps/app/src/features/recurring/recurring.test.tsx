import { describe, expect, it, jest } from "@jest/globals";
import { parseMoney } from "@hisaab/domain";
import { screen, userEvent } from "@testing-library/react-native";

import type { WalletChoice } from "@/features/entries/types";
import { formatMoney } from "@/lib/format";
import { makeCategory } from "@/test/categories";
import { render } from "@/test/render";

import { PendingList } from "./pending-list";
import { PendingTile } from "./pending-tile";
import { RuleForm } from "./rule-form";
import { RuleList } from "./rule-list";
import type { Confirmation, Due, RecurringRule, RuleDraft } from "./types";

const wallets: WalletChoice[] = [
	{ id: "w1", name: "Cash", currency: "PKR", archived_at: null },
	{ id: "w2", name: "HBL", currency: "PKR", archived_at: null },
];
const categories = [
	makeCategory("c1", "Rent"),
	makeCategory("c2", "Utilities"),
	makeCategory("c3", "Salary", { kind: "income" }),
];

const makeRule = (
	id: string,
	overrides: Partial<RecurringRule> = {},
): RecurringRule => ({
	id,
	household_id: "h1",
	mode: "confirm",
	kind: "expense",
	wallet_id: "w1",
	category_id: "c1",
	amount: "50000",
	description: null,
	frequency: "monthly",
	interval: 1,
	day_of_month: 1,
	starts_on: "2026-10-01",
	ends_on: null,
	created_by: "u1",
	created_at: "2026-10-01T00:00:00.000Z",
	_metadata: null,
	_deleted: null,
	...overrides,
});

const pkr = (amount: string) => formatMoney(parseMoney(amount, "PKR"));

describe("RuleForm", () => {
	const setup = async () => {
		const onSubmit = jest.fn(async (_draft: RuleDraft) => {});
		await render(
			<RuleForm
				baseCurrency="PKR"
				categories={categories}
				onSubmit={onSubmit}
				submitLabel="Save Recurring rule"
				today="2026-10-28"
				wallets={wallets}
			/>,
		);
		return { onSubmit, user: userEvent.setup() };
	};

	it("makes a monthly rule on a day, waiting for a confirm by default", async () => {
		const { onSubmit, user } = await setup();
		await user.type(screen.getByLabelText("Amount (PKR)"), "50000");
		const day = screen.getByLabelText("Day of the month");
		await user.clear(day);
		await user.type(day, "1");
		await user.press(
			screen.getByRole("button", { name: "Save Recurring rule" }),
		);
		expect(onSubmit).toHaveBeenCalledWith({
			mode: "confirm",
			kind: "expense",
			walletId: "w1",
			categoryId: "c1",
			amount: "50000",
			description: null,
			frequency: "monthly",
			interval: 1,
			dayOfMonth: 1,
			startsOn: "2026-10-28",
			endsOn: null,
		});
	});

	it("makes a variable bill every other week until an end", async () => {
		const { onSubmit, user } = await setup();
		await user.press(screen.getByRole("radio", { name: "Utilities" }));
		await user.press(screen.getByRole("radio", { name: "Weekly" }));
		expect(screen.queryByLabelText("Day of the month")).toBeNull();
		const every = screen.getByLabelText("Every");
		await user.clear(every);
		await user.type(every, "2");
		await user.type(screen.getByLabelText("Ends"), "2027-03-31");
		await user.press(
			screen.getByRole("button", { name: "Save Recurring rule" }),
		);
		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				categoryId: "c2",
				amount: null,
				frequency: "weekly",
				interval: 2,
				dayOfMonth: null,
				endsOn: "2027-03-31",
			}),
		);
	});

	it("makes Expected income from the Income list", async () => {
		const { onSubmit, user } = await setup();
		await user.press(screen.getByRole("radio", { name: "Income" }));
		await user.type(screen.getByLabelText("Amount (PKR)"), "250000");
		await user.press(screen.getByRole("radio", { name: "Auto-record" }));
		await user.press(
			screen.getByRole("button", { name: "Save Recurring rule" }),
		);
		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "income",
				categoryId: "c3",
				mode: "auto",
			}),
		);
	});

	it("asks for an amount before it Auto-records", async () => {
		const { onSubmit, user } = await setup();
		await user.press(screen.getByRole("radio", { name: "Auto-record" }));
		await user.press(
			screen.getByRole("button", { name: "Save Recurring rule" }),
		);
		expect(screen.getByRole("alert")).toHaveTextContent(/needs an amount/i);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("keeps an end after the start", async () => {
		const { onSubmit, user } = await setup();
		await user.type(screen.getByLabelText("Ends"), "2026-01-01");
		await user.press(
			screen.getByRole("button", { name: "Save Recurring rule" }),
		);
		expect(screen.getByRole("alert")).toHaveTextContent(
			/on or after the start/i,
		);
		expect(onSubmit).not.toHaveBeenCalled();
	});
});

describe("RuleList", () => {
	it("shows what each rule is, how often and when it's next due", async () => {
		const onOpen = jest.fn();
		await render(
			<RuleList
				baseCurrency="PKR"
				categoryNames={
					new Map([
						["c1", "Rent"],
						["c2", "Utilities"],
					])
				}
				onOpen={onOpen}
				rules={[
					makeRule("r1"),
					makeRule("r2", {
						category_id: "c2",
						amount: null,
						interval: 2,
						day_of_month: 31,
					}),
				]}
				today="2026-10-28"
			/>,
		);
		expect(screen.getByText(`Rent · ${pkr("50000")}`)).toBeVisible();
		expect(
			screen.getByText(/^Monthly on day 1 · Confirm each one · Next /),
		).toBeVisible();
		expect(screen.getByText("Utilities · Varies")).toBeVisible();
		expect(screen.getByText(/^Every 2 months on day 31/)).toBeVisible();
		await userEvent.setup().press(screen.getByText("Utilities · Varies"));
		expect(onOpen).toHaveBeenCalledWith("r2");
	});
});

describe("PendingList", () => {
	const rent = makeRule("r1", { description: "Rent" });
	const internet = makeRule("r2", {
		category_id: "c2",
		amount: "3000",
		description: "Internet",
	});
	const power = makeRule("r3", {
		category_id: "c2",
		amount: null,
		description: "Electricity",
	});
	const pending: Due[] = [
		{ rule: rent, dueOn: "2026-10-01" },
		{ rule: internet, dueOn: "2026-10-05" },
		{ rule: power, dueOn: "2026-10-10" },
	];

	const setup = async (canEdit = true) => {
		const handlers = {
			onConfirm: jest.fn(async (_c: Confirmation[]) => {}),
			onSkip: jest.fn(async (_d: Due) => {}),
			onSnooze: jest.fn(async (_d: Due, _until: string) => {}),
		};
		await render(
			<PendingList
				baseCurrency="PKR"
				canEdit={canEdit}
				categoryNames={new Map()}
				pending={pending}
				today="2026-10-28"
				{...handlers}
			/>,
		);
		return { ...handlers, user: userEvent.setup() };
	};

	it("confirms the fixed amounts together, leaving out any unpicked", async () => {
		const { onConfirm, user } = await setup();
		await user.press(
			screen.getByRole("checkbox", { name: /^Confirm Internet/ }),
		);
		await user.press(screen.getByRole("button", { name: "Confirm 1" }));
		expect(onConfirm).toHaveBeenCalledWith([
			{ due: pending[0], amount: "50000", occurredOn: "2026-10-01" },
		]);
	});

	it("asks a variable bill's amount first", async () => {
		const { onConfirm, user } = await setup();
		await user.press(
			screen.getByRole("button", { name: "Confirm Electricity" }),
		);
		expect(screen.getByRole("alert")).toHaveTextContent(/more than zero/i);
		await user.type(
			screen.getByLabelText("Amount for Electricity (PKR)"),
			"4500",
		);
		await user.press(
			screen.getByRole("button", { name: "Confirm Electricity" }),
		);
		expect(onConfirm).toHaveBeenCalledWith([
			{ due: pending[2], amount: "4500", occurredOn: "2026-10-10" },
		]);
	});

	it("confirms one with changes", async () => {
		const { onConfirm, user } = await setup();
		await user.press(
			screen.getAllByRole("button", { name: "Change and confirm" }).at(0) ??
				screen.getByText("none"),
		);
		const amount = screen.getByLabelText("Amount for Rent (PKR)");
		await user.clear(amount);
		await user.type(amount, "52000");
		await user.press(screen.getByRole("button", { name: "Confirm Rent" }));
		expect(onConfirm).toHaveBeenCalledWith([
			{ due: pending[0], amount: "52000", occurredOn: "2026-10-01" },
		]);
	});

	it("leaves one being changed out of the batch", async () => {
		const { onConfirm, user } = await setup();
		await user.press(
			screen.getAllByRole("button", { name: "Change and confirm" }).at(0) ??
				screen.getByText("none"),
		);
		await user.press(screen.getByRole("button", { name: "Confirm 1" }));
		expect(onConfirm).toHaveBeenCalledWith([
			{ due: pending[1], amount: "3000", occurredOn: "2026-10-05" },
		]);
	});

	it("skips or snoozes one for the household", async () => {
		const { onSkip, onSnooze, user } = await setup();
		await user.press(screen.getByRole("button", { name: /^Skip Internet/ }));
		expect(onSkip).toHaveBeenCalledWith(pending[1]);
		await user.press(screen.getByRole("button", { name: /^Snooze Rent/ }));
		await user.press(screen.getByRole("button", { name: "For 3 days" }));
		expect(onSnooze).toHaveBeenCalledWith(pending[0], "2026-10-31");
	});

	it("lets a Viewer only look", async () => {
		await setup(false);
		expect(screen.getByLabelText(/^Rent, due/)).toBeVisible();
		expect(screen.queryByRole("button", { name: /^Confirm/ })).toBeNull();
		expect(screen.queryByRole("button", { name: /^Skip/ })).toBeNull();
	});
});

describe("PendingTile", () => {
	it("counts what waits and opens the Pending list", async () => {
		const onOpen = jest.fn();
		await render(
			<PendingTile
				count={3}
				onOpen={onOpen}
			/>,
		);
		await userEvent
			.setup()
			.press(
				screen.getByText("3 recurring Entries wait for you to confirm them."),
			);
		expect(onOpen).toHaveBeenCalled();
	});

	it("isn't shown when nothing waits", async () => {
		await render(
			<PendingTile
				count={0}
				onOpen={() => {}}
			/>,
		);
		expect(screen.queryByText("Pending")).toBeNull();
	});
});
