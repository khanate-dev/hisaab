import { describe, expect, it, jest } from "@jest/globals";
import { parseMoney } from "@hisaab/domain";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import { WalletList } from "./wallet-list";

describe("WalletList", () => {
	it("shows each Wallet with its type and its derived Balance in its own currency", async () => {
		await render(
			<WalletList
				wallets={[
					{
						id: "w1",
						name: "Cash",
						type: "cash",
						balance: parseMoney("1500.5", "PKR"),
					},
					{
						id: "w2",
						name: "Visa",
						type: "credit_card",
						balance: parseMoney("-250", "USD"),
					},
				]}
			/>,
		);

		const items = screen.getAllByRole("listitem");
		expect(items).toHaveLength(2);
		expect(items[0]).toHaveTextContent(/Cash/);
		expect(items[0]).toHaveTextContent(/1,500\.5(?!\d)/);
		expect(items[1]).toHaveTextContent(/Credit card/);
		expect(items[1]).toHaveTextContent(/owed/i);
	});

	it("shows a Credit card's negative Balance as what's owed, not as a warning", async () => {
		await render(
			<WalletList
				wallets={[
					{
						id: "w",
						name: "Visa",
						type: "credit_card",
						balance: parseMoney("-250", "USD"),
					},
				]}
			/>,
		);
		const item = screen.getByRole("listitem");
		expect(item).toHaveTextContent(/owed/i);
		expect(item).toHaveTextContent(/\$250\.00/);
		expect(screen.queryByText(/below zero/i)).toBeNull();
	});

	it("warns about any other Wallet below zero", async () => {
		await render(
			<WalletList
				wallets={[
					{
						id: "w",
						name: "Cash",
						type: "cash",
						balance: parseMoney("-5", "PKR"),
					},
				]}
			/>,
		);
		expect(screen.getByRole("listitem")).toHaveTextContent(/below zero/i);
	});

	it("opens a Wallet when it's pressed", async () => {
		const onOpen = jest.fn((_id: string) => {});
		await render(
			<WalletList
				onOpen={onOpen}
				wallets={[
					{
						id: "w",
						name: "Cash",
						type: "cash",
						balance: parseMoney("5", "PKR"),
					},
				]}
			/>,
		);
		await userEvent
			.setup()
			.press(screen.getByRole("button", { name: /cash/i }));
		expect(onOpen).toHaveBeenCalledWith("w");
	});

	it("says there are no Wallets yet", async () => {
		await render(<WalletList wallets={[]} />);
		expect(screen.getByRole("status")).toHaveTextContent(/no wallets/i);
	});
});
