import { describe, expect, it, jest } from "@jest/globals";
import { PortalHost } from "@rn-primitives/portal";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import { HouseholdExit } from "./household-exit";
import { MemberList } from "./member-list";
import type { Member } from "./use-members";

const members: Member[] = [
	{ membershipId: "m1", userId: "u1", name: "Aisha", role: "admin" },
	{ membershipId: "m2", userId: "u2", name: "Bilal", role: "viewer" },
];

/** Presses the last button by this name: a dialog's action, past the trigger that opened it. */
const pressLast = async (name: string) => {
	const buttons = await screen.findAllByRole("button", { name });
	await userEvent.press(
		buttons[buttons.length - 1] as (typeof buttons)[number],
	);
};

describe("MemberList", () => {
	it("shows everyone's Role, the User's own row marked and without controls", async () => {
		await render(
			<MemberList
				isAdmin
				members={members}
				onChangeRole={() => {}}
				onRemove={() => {}}
				userId="u1"
			/>,
		);
		expect(screen.getByLabelText("Aisha (you), Admin")).toBeOnTheScreen();
		expect(screen.getByLabelText("Bilal, Viewer")).toBeOnTheScreen();
		expect(screen.queryByRole("button", { name: "Remove Aisha" })).toBeNull();
	});

	it("lets an Admin change a Role and remove someone, after confirming", async () => {
		const onChangeRole = jest.fn();
		const onRemove = jest.fn();
		await render(
			<>
				<MemberList
					isAdmin
					members={members}
					onChangeRole={onChangeRole}
					onRemove={onRemove}
					userId="u1"
				/>
				<PortalHost />
			</>,
		);
		await userEvent.press(screen.getByRole("radio", { name: "Member" }));
		expect(onChangeRole).toHaveBeenCalledWith("m2", "member");
		await userEvent.press(screen.getByRole("button", { name: "Remove Bilal" }));
		expect(onRemove).not.toHaveBeenCalled();
		await pressLast("Remove");
		expect(onRemove).toHaveBeenCalledWith("m2");
	});

	it("gives everyone else the list without controls", async () => {
		await render(
			<MemberList
				isAdmin={false}
				members={members}
				onChangeRole={() => {}}
				onRemove={() => {}}
				userId="u2"
			/>,
		);
		expect(screen.queryByRole("radio")).toBeNull();
		expect(screen.queryByRole("button")).toBeNull();
	});
});

describe("HouseholdExit", () => {
	const setup = async (
		props: Partial<Parameters<typeof HouseholdExit>[0]> = {},
	) => {
		const onLeave = jest.fn();
		const onDelete = jest.fn();
		await render(
			<>
				<HouseholdExit
					householdName="Family"
					isAdmin={false}
					lastAdmin={false}
					onDelete={onDelete}
					onLeave={onLeave}
					{...props}
				/>
				<PortalHost />
			</>,
		);
		return { onLeave, onDelete, user: userEvent.setup() };
	};

	it("leaves after confirming, and offers no deletion to a Member", async () => {
		const { onLeave, user } = await setup();
		expect(
			screen.queryByRole("button", { name: "Delete household" }),
		).toBeNull();
		await user.press(screen.getByRole("button", { name: "Leave household" }));
		await pressLast("Leave");
		expect(onLeave).toHaveBeenCalled();
	});

	it("keeps the last Admin from leaving", async () => {
		await setup({ isAdmin: true, lastAdmin: true });
		expect(
			screen.getByRole("button", { name: "Leave household" }),
		).toBeDisabled();
	});

	it("deletes the household only once an Admin types its name", async () => {
		const { onDelete, user } = await setup({ isAdmin: true });
		await user.press(screen.getByRole("button", { name: "Delete household" }));
		const confirm = await screen.findByRole("button", {
			name: "Delete for everyone",
		});
		expect(confirm).toBeDisabled();
		await user.type(
			screen.getByLabelText("Type its name to confirm"),
			"Family",
		);
		await user.press(
			screen.getByRole("button", { name: "Delete for everyone" }),
		);
		expect(onDelete).toHaveBeenCalled();
	});
});
