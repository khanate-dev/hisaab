import { describe, expect, it, jest } from "@jest/globals";
import type { NotificationTrigger } from "@hisaab/domain";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import { type InboxItem, InboxList } from "./inbox-list";
import { PreferencesList } from "./preferences-list";

const item = (id: string, payload: object): InboxItem => ({
	id,
	trigger: "membership",
	payload: JSON.stringify({
		householdName: "Family",
		role: "member",
		...payload,
	}),
	created_at: "2026-10-28T09:00:00.000Z",
});

describe("InboxList", () => {
	it("says what happened, to the User about themselves and about others, marking what was new on arrival", async () => {
		await render(
			<InboxList
				fresh={new Set(["d1", "d3", "d4"])}
				items={[
					item("d1", { change: "joined", userId: "u2", name: "Bilal" }),
					item("d2", {
						change: "role_changed",
						userId: "u1",
						name: "Ayesha",
						role: "admin",
					}),
					item("d3", { change: "removed", userId: "u3", name: "Sara" }),
					item("d4", { change: "left", userId: "u1", name: "Ayesha" }),
					item("d5", { change: "joined", userId: "u4", name: null }),
				]}
				userId="u1"
			/>,
		);
		expect(screen.getByLabelText("New: Bilal joined Family.")).toBeVisible();
		expect(screen.getByLabelText("You're now Admin in Family.")).toBeVisible();
		expect(
			screen.getByLabelText("New: Sara was removed from Family."),
		).toBeVisible();
		expect(screen.getByLabelText("New: You left Family.")).toBeVisible();
		expect(screen.getByLabelText("Someone joined Family.")).toBeVisible();
	});

	it("says when there's nothing yet", async () => {
		await render(
			<InboxList
				fresh={new Set()}
				items={[]}
				userId="u1"
			/>,
		);
		expect(screen.getByRole("status")).toHaveTextContent(
			"No Notifications yet.",
		);
	});
});

describe("PreferencesList", () => {
	const setup = async (
		role: "admin" | "viewer",
		choices: { trigger: string; enabled: boolean }[] = [],
	) => {
		const onChange = jest.fn((_t: NotificationTrigger, _on: boolean) => {});
		await render(
			<PreferencesList
				choices={choices}
				householdName="Family"
				onChange={onChange}
				role={role}
			/>,
		);
		return { onChange, user: userEvent.setup() };
	};

	it("starts push from the Role's defaults: a Viewer gets only the Monthly summary", async () => {
		await setup("viewer");
		expect(
			screen.getByRole("checkbox", { name: "Monthly summary" }),
		).toBeChecked();
		expect(
			screen.getByRole("checkbox", { name: "Membership" }),
		).not.toBeChecked();
		expect(
			screen.getByText(/Your inbox gets every Notification from Family/),
		).toBeVisible();
	});

	it("turns a trigger's push off or on, the User's own choice over the default", async () => {
		const { onChange, user } = await setup("admin", [
			{ trigger: "membership", enabled: false },
		]);
		expect(
			screen.getByRole("checkbox", { name: "Membership" }),
		).not.toBeChecked();
		expect(
			screen.getByRole("checkbox", { name: "Household activity" }),
		).not.toBeChecked();
		await user.press(screen.getByRole("checkbox", { name: "Membership" }));
		expect(onChange).toHaveBeenCalledWith("membership", true);
		await user.press(
			screen.getByRole("checkbox", { name: "Household activity" }),
		);
		expect(onChange).toHaveBeenCalledWith("household_activity", true);
	});
});
