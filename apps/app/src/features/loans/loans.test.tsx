import { describe, expect, it, jest } from "@jest/globals";
import { parseMoney } from "@hisaab/domain";
import { PortalHost } from "@rn-primitives/portal";
import { screen, userEvent } from "@testing-library/react-native";

import type { Contact } from "@/features/contacts/use-contacts";
import type { WalletChoice } from "@/features/entries/types";
import { formatMoney } from "@/lib/format";
import { makeEntry } from "@/test/entries";
import { render } from "@/test/render";

import type { LoanDraft } from "./actions";
import { LoanDetail } from "./loan-detail";
import { LoanForm } from "./loan-form";
import { LoansTile } from "./loans-tile";
import type { LoanView } from "./use-loans";

const wallets: WalletChoice[] = [
	{ id: "w1", name: "Cash", currency: "PKR", archived_at: null },
	{ id: "w2", name: "HBL", currency: "PKR", archived_at: null },
];
const ali: Contact = {
	id: "k1",
	household_id: "h1",
	name: "Ali",
	archived_at: null,
	created_at: "2026-10-01T00:00:00.000Z",
	_metadata: null,
	_deleted: null,
};

const view = (overrides: Partial<LoanView> = {}): LoanView => ({
	loan: {
		id: "l1",
		household_id: "h1",
		contact_id: "k1",
		direction: "lent",
		due_on: "2026-12-31",
		written_off_at: null,
		notes: null,
		created_at: "2026-10-01T00:00:00.000Z",
		_metadata: null,
		_deleted: null,
	},
	direction: "lent",
	contact: ali,
	principal: makeEntry("e1", {
		kind: "loan_principal",
		category_id: null,
		amount: "-1000",
		loan_id: "l1",
	}),
	repayments: [
		makeEntry("e2", {
			kind: "repayment",
			category_id: null,
			amount: "300",
			loan_id: "l1",
		}),
	],
	currency: "PKR",
	outstanding: parseMoney("700", "PKR"),
	settled: false,
	...overrides,
});

describe("LoanForm", () => {
	const setup = async (contacts: Contact[] = [ali]) => {
		const onSubmit = jest.fn(
			async (_draft: LoanDraft, _currency: string) => {},
		);
		await render(
			<LoanForm
				baseCurrency="PKR"
				contacts={contacts}
				onSubmit={onSubmit}
				timeZone="Asia/Karachi"
				today="2026-10-26"
				wallets={wallets}
			/>,
		);
		return { onSubmit, user: userEvent.setup() };
	};

	it("records money Lent to a Contact, from a Wallet, with a due date", async () => {
		const { onSubmit, user } = await setup();
		await user.type(screen.getByLabelText("Amount (PKR)"), "1000");
		await user.type(screen.getByLabelText("Due"), "2026-12-31");
		await user.press(screen.getByRole("button", { name: "Save Loan" }));
		expect(onSubmit).toHaveBeenCalledWith(
			{
				direction: "lent",
				contact: { id: "k1" },
				walletId: "w1",
				amount: "1000",
				occurredOn: "2026-10-26",
				dueOn: "2026-12-31",
				notes: null,
			},
			"PKR",
		);
	});

	it("records money Borrowed from someone new", async () => {
		const { onSubmit, user } = await setup([]);
		await user.press(screen.getByRole("radio", { name: "Borrowed" }));
		await user.type(screen.getByLabelText("Their name"), "Sara");
		await user.type(screen.getByLabelText("Amount (PKR)"), "500");
		await user.press(screen.getByRole("button", { name: "Save Loan" }));
		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				direction: "borrowed",
				contact: { name: "Sara" },
				amount: "500",
			}),
			"PKR",
		);
	});

	it("asks for an amount more than zero", async () => {
		const { onSubmit, user } = await setup();
		await user.press(screen.getByRole("button", { name: "Save Loan" }));
		expect(screen.getByRole("alert")).toHaveTextContent(/more than zero/i);
		expect(onSubmit).not.toHaveBeenCalled();
	});
});

describe("LoanDetail", () => {
	const setup = async (
		props: Partial<Parameters<typeof LoanDetail>[0]> = {},
	) => {
		const handlers = {
			onRepay: jest.fn(
				async (_r: {
					walletId: string;
					amount: string;
					occurredOn: string;
				}) => {},
			),
			onWriteOff: jest.fn(async (_w: boolean) => {}),
			onDelete: jest.fn(async () => {}),
		};
		await render(
			<>
				<LoanDetail
					canEdit
					today="2026-10-26"
					view={view()}
					wallets={wallets}
					{...handlers}
					{...props}
				/>
				<PortalHost />
			</>,
		);
		return { ...handlers, user: userEvent.setup() };
	};

	it("shows what's outstanding and the Repayments", async () => {
		await setup();
		expect(screen.getByLabelText("Outstanding")).toHaveAccessibilityValue({
			text: formatMoney(parseMoney("700", "PKR")),
		});
		expect(screen.getAllByRole("listitem")).toHaveLength(1);
	});

	it("records a Repayment into a Wallet", async () => {
		const { onRepay, user } = await setup();
		await user.press(screen.getByRole("button", { name: "Record Repayment" }));
		await user.press(screen.getByRole("radio", { name: "HBL" }));
		await user.type(screen.getByLabelText("Repayment (PKR)"), "200");
		await user.press(screen.getByRole("button", { name: "Save Repayment" }));
		expect(onRepay).toHaveBeenCalledWith({
			walletId: "w2",
			amount: "200",
			occurredOn: "2026-10-26",
		});
	});

	it("writes off what's left only after confirming", async () => {
		const { onWriteOff, user } = await setup();
		await user.press(screen.getByRole("button", { name: "Write off" }));
		expect(onWriteOff).not.toHaveBeenCalled();
		await screen.findByRole("heading", { name: /write off/i });
		const writeOffs = screen.getAllByRole("button", { name: "Write off" });
		await user.press(
			writeOffs[writeOffs.length - 1] as (typeof writeOffs)[number],
		);
		expect(onWriteOff).toHaveBeenCalledWith(true);
	});

	it("shows a written-off Loan as settled, with an undo", async () => {
		await setup({
			view: view({
				settled: true,
				loan: { ...view().loan, written_off_at: "2026-10-26T00:00:00.000Z" },
			}),
		});
		expect(screen.getByLabelText("Outstanding")).toHaveAccessibilityValue({
			text: "Written off",
		});
		expect(
			screen.getByRole("button", { name: "Undo write-off" }),
		).toBeOnTheScreen();
		expect(
			screen.queryByRole("button", { name: "Record Repayment" }),
		).toBeNull();
	});

	it("is read-only for Viewers", async () => {
		await setup({ canEdit: false });
		expect(
			screen.queryByRole("button", { name: "Record Repayment" }),
		).toBeNull();
		expect(screen.queryByRole("button", { name: "Delete Loan" })).toBeNull();
	});
});

describe("LoansTile", () => {
	it("shows only while a Loan is outstanding", async () => {
		await render(
			<LoansTile
				loans={[view({ settled: true })]}
				onOpen={() => {}}
			/>,
		);
		expect(screen.queryByRole("button")).toBeNull();
	});

	it("sums what's owed each way and opens the Loans", async () => {
		const onOpen = jest.fn();
		await render(
			<LoansTile
				loans={[
					view(),
					view({ direction: "borrowed", outstanding: parseMoney("50", "PKR") }),
				]}
				onOpen={onOpen}
			/>,
		);
		const tile = screen.getByRole("button");
		expect(tile).toHaveTextContent(/Owed to you/);
		expect(tile).toHaveTextContent(/You owe/);
		await userEvent.press(tile);
		expect(onOpen).toHaveBeenCalled();
	});
});
