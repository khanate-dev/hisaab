import { describe, expect, it } from "@jest/globals";
import { parseMoney } from "@hisaab/domain";
import { screen } from "@testing-library/react-native";

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
		expect(items[1]).toHaveTextContent(/-\$250\.00|\$-250\.00|−\$250\.00/);
	});

	it("says there are no Wallets yet", async () => {
		await render(<WalletList wallets={[]} />);
		expect(screen.getByRole("status")).toHaveTextContent(/no wallets/i);
	});
});
