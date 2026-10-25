import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import { HouseholdList } from "./household-list";

describe("HouseholdList", () => {
	it("shows the Personal household first as Personal, then shared households with the User's Role", async () => {
		await render(
			<HouseholdList
				households={[
					{ id: "h2", name: "Family", isPersonal: false, role: "viewer" },
					{ id: "h1", name: "Personal", isPersonal: true, role: "admin" },
				]}
			/>,
		);

		const items = screen.getAllByRole("listitem");
		expect(items).toHaveLength(2);
		expect(items[0]).toHaveTextContent(/Personal/);
		expect(items[0]).not.toHaveTextContent(/Admin/);
		expect(items[1]).toHaveTextContent(/Family/);
		expect(items[1]).toHaveTextContent(/Viewer/);
	});

	it("says it is still syncing while there is no household yet", async () => {
		await render(<HouseholdList households={[]} />);
		expect(screen.getByRole("status")).toHaveTextContent(/syncing/i);
	});
});
