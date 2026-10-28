import { describe, expect, it, jest } from "@jest/globals";
import type { NotificationTrigger } from "@hisaab/domain";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import { type InboxItem, InboxList } from "./inbox-list";
import { PreferencesList } from "./preferences-list";

const item = (
	id: string,
	payload: object,
	read_at: string | null = null,
): InboxItem => ({
	id,
	trigger: "membership",
	payload: JSON.stringify({ householdName: "Family", ...payload }),
	created_at: "2026-10-28T09:00:00.000Z",
	read_at,
});

describe("InboxList", () => {
	it("says what happened, to the User about themselves and about others, new ones marked", async () => {
		await render(
			<InboxList
				items={[
					item("d1", { change: "joined", userId: "u2", name: "Bilal" }),
					item(
						"d2",
						{
							change: "role_changed",
							userId: "u1",
							name: "Ayesha",
							role: "admin",
						},
						"2026-10-28T10:00:00.000Z",
					),
					item("d3", { change: "removed", userId: "u3", name: "Sara" }),
					item("d4", { change: "left", userId: "u1", name: "Ayesha" }),
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
	});

	it("says when there's nothing yet", async () => {
		await render(
			<InboxList
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
		preferences = [] as Parameters<typeof PreferencesList>[0]["preferences"],
	) => {
		const onChange = jest.fn((_t: NotificationTrigger, _on: boolean) => {});
		await render(
			<PreferencesList
				householdName="Family"
				onChange={onChange}
				preferences={preferences}
				role={role}
				userId="u1"
			/>,
		);
		return { onChange, user: userEvent.setup() };
	};

	it("starts from the Role's defaults: a Viewer gets only the Monthly summary", async () => {
		await setup("viewer");
		expect(
			screen.getByRole("checkbox", { name: "Monthly summary" }),
		).toBeChecked();
		expect(
			screen.getByRole("checkbox", { name: "Membership" }),
		).not.toBeChecked();
	});

	it("turns a trigger off or on, the User's latest choice winning", async () => {
		const { onChange, user } = await setup("admin", [
			{
				user_id: "u1",
				trigger: "membership",
				enabled: false,
				created_at: "2026-10-01T00:00:00.000Z",
			},
			{
				user_id: "u1",
				trigger: "membership",
				enabled: true,
				created_at: "2026-10-02T00:00:00.000Z",
			},
		]);
		expect(screen.getByRole("checkbox", { name: "Membership" })).toBeChecked();
		expect(
			screen.getByRole("checkbox", { name: "Household activity" }),
		).not.toBeChecked();
		await user.press(screen.getByRole("checkbox", { name: "Membership" }));
		expect(onChange).toHaveBeenCalledWith("membership", false);
		await user.press(
			screen.getByRole("checkbox", { name: "Household activity" }),
		);
		expect(onChange).toHaveBeenCalledWith("household_activity", true);
	});
});
