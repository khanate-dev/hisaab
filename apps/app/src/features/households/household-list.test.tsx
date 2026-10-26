import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import { HouseholdList } from "./household-list";

const households = [
	{ id: "h2", name: "Family", isPersonal: false, role: "viewer" as const },
	{ id: "h1", name: "Personal", isPersonal: true, role: "admin" as const },
	{ id: "h3", name: "Flat", isPersonal: false, role: "admin" as const },
];

describe("HouseholdList", () => {
	it("shows Personal first, then shared households by name with the User's Role", async () => {
		await render(
			<HouseholdList
				currentId="h1"
				households={households}
				onPick={() => {}}
			/>,
		);
		const names = screen
			.getAllByRole("button")
			.map((button) => button.props.accessibilityLabel);
		expect(names).toEqual(["Personal", "Family, Viewer", "Flat, Admin"]);
	});

	it("marks the household on screen and switches when another is picked", async () => {
		const onPick = jest.fn();
		await render(
			<HouseholdList
				currentId="h1"
				households={households}
				onPick={onPick}
			/>,
		);
		expect(screen.getByRole("button", { name: "Personal" })).toBeSelected();
		expect(
			screen.getByRole("button", { name: "Family, Viewer" }),
		).not.toBeSelected();
		await userEvent.press(
			screen.getByRole("button", { name: "Family, Viewer" }),
		);
		expect(onPick).toHaveBeenCalledWith("h2");
	});

	it("says it is still syncing while there is no household yet", async () => {
		await render(
			<HouseholdList
				currentId={undefined}
				households={[]}
				onPick={() => {}}
			/>,
		);
		expect(screen.getByRole("status")).toHaveTextContent(/syncing/i);
	});
});
