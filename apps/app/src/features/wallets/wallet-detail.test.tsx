import { describe, expect, it, jest } from "@jest/globals";
import { parseMoney } from "@hisaab/domain";
import { PortalHost } from "@rn-primitives/portal";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import { WalletDetail } from "./wallet-detail";

const wallet = {
	id: "w1",
	name: "Cash",
	type: "cash" as const,
	balance: parseMoney("50", "PKR"),
	archived: false,
};
const history = [
	{
		entryId: "e1",
		occurredOn: "2026-10-01",
		kind: "balance_adjustment" as const,
		amount: parseMoney("100", "PKR"),
		balance: parseMoney("100", "PKR"),
	},
	{
		entryId: "e2",
		occurredOn: "2026-10-05",
		kind: "balance_adjustment" as const,
		amount: parseMoney("-50", "PKR"),
		balance: parseMoney("50", "PKR"),
	},
];

const setup = async (
	props: Partial<Parameters<typeof WalletDetail>[0]> = {},
) => {
	const handlers = {
		onEdit: jest.fn(() => {}),
		onArchive: jest.fn(async () => {}),
		onUnarchive: jest.fn(async () => {}),
	};
	await render(
		<>
			<WalletDetail
				canEdit
				history={history}
				wallet={wallet}
				{...handlers}
				{...props}
			/>
			<PortalHost />
		</>,
	);
	return { ...handlers, user: userEvent.setup() };
};

describe("WalletDetail", () => {
	it("shows the balance history, newest first, with the running Balance after each Entry", async () => {
		await setup();
		const rows = screen.getAllByRole("listitem");
		expect(rows).toHaveLength(2);
		expect(rows[0]).toHaveTextContent(/5 Oct 2026|Oct 5, 2026|2026-10-05/);
		expect(rows[0]).toHaveTextContent(/-PKR\s?50|PKR\s?-50/);
		expect(rows[1]).toHaveTextContent(/PKR\s?100/);
	});

	it("archives only after confirming", async () => {
		const { user, onArchive } = await setup();

		await user.press(screen.getByRole("button", { name: "Archive" }));
		expect(onArchive).not.toHaveBeenCalled();
		expect(
			await screen.findByRole("heading", { name: /archive cash\?/i }),
		).toBeOnTheScreen();
		await user.press(screen.getByRole("button", { name: "Archive Wallet" }));
		expect(onArchive).toHaveBeenCalled();
	});

	it("reads a Credit card's history as what's owed, not as below zero", async () => {
		await setup({
			wallet: {
				...wallet,
				type: "credit_card",
				balance: parseMoney("-250", "PKR"),
			},
			history: [
				{
					entryId: "e1",
					occurredOn: "2026-10-01",
					kind: "balance_adjustment",
					amount: parseMoney("-250", "PKR"),
					balance: parseMoney("-250", "PKR"),
				},
			],
		});
		const [row] = screen.getAllByRole("listitem");
		expect(row).toHaveTextContent(/owed/i);
		expect(row).not.toHaveTextContent(/below zero/i);
	});

	it("flags a history step that took a Cash Wallet below zero", async () => {
		await setup({
			history: [
				{
					entryId: "e1",
					occurredOn: "2026-10-01",
					kind: "balance_adjustment",
					amount: parseMoney("-20", "PKR"),
					balance: parseMoney("-20", "PKR"),
				},
			],
		});
		expect(screen.getByRole("listitem")).toHaveTextContent(/below zero/i);
	});

	it("brings an archived Wallet back", async () => {
		const { user, onUnarchive } = await setup({
			wallet: { ...wallet, archived: true },
		});
		expect(screen.getByRole("note")).toHaveTextContent(/archived/i);
		await user.press(screen.getByRole("button", { name: "Unarchive" }));
		expect(onUnarchive).toHaveBeenCalled();
	});

	it("offers no changes to a Viewer", async () => {
		await setup({ canEdit: false });
		expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
	});
});
