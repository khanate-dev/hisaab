import { describe, expect, it, jest } from "@jest/globals";
import type { AcceptResult, InvitePreview } from "@hisaab/domain";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import type { InviteDraft } from "./actions";
import { InviteForm } from "./invite-form";
import { InviteLanding } from "./invite-landing";
import { InviteList } from "./invite-list";
import type { InviteRow } from "./use-invites";
import { JoinWithLinkForm } from "./join-with-link-form";

const TOKEN = "a".repeat(32);
const NOW = new Date("2026-10-26T12:00:00.000Z");

const invite = (overrides: Partial<InviteRow> = {}): InviteRow => ({
	id: "i1",
	household_id: "h1",
	token: TOKEN,
	role: "member",
	email: null,
	expires_at: "2026-11-02T12:00:00.000Z",
	revoked_at: null,
	accepted_by: null,
	accepted_at: null,
	created_by: "u1",
	created_at: "2026-10-26T12:00:00.000Z",
	_metadata: null,
	_deleted: null,
	...overrides,
});

describe("InviteForm", () => {
	it("creates a Member Invite for anyone, for a week, by default", async () => {
		const onSubmit = jest.fn(async (_draft: InviteDraft) => {});
		await render(<InviteForm onSubmit={onSubmit} />);
		await userEvent.press(
			screen.getByRole("button", { name: "Create Invite" }),
		);
		expect(onSubmit).toHaveBeenCalledWith({
			role: "member",
			email: null,
			lifetime: 7,
		});
	});

	it("ties an Invite to one email, with another Role and lifetime", async () => {
		const onSubmit = jest.fn(async (_draft: InviteDraft) => {});
		await render(<InviteForm onSubmit={onSubmit} />);
		const user = userEvent.setup();
		await user.press(screen.getByRole("radio", { name: "Viewer" }));
		await user.press(screen.getByRole("radio", { name: "1 day" }));
		await user.type(screen.getByLabelText("For email"), " sara@example.com ");
		await user.press(screen.getByRole("button", { name: "Create Invite" }));
		expect(onSubmit).toHaveBeenCalledWith({
			role: "viewer",
			email: "sara@example.com",
			lifetime: 1,
		});
	});

	it("asks for a real email when one is typed", async () => {
		const onSubmit = jest.fn(async (_draft: InviteDraft) => {});
		await render(<InviteForm onSubmit={onSubmit} />);
		await userEvent.type(screen.getByLabelText("For email"), "sara");
		await userEvent.press(
			screen.getByRole("button", { name: "Create Invite" }),
		);
		expect(screen.getByRole("alert")).toHaveTextContent(/email like/);
		expect(onSubmit).not.toHaveBeenCalled();
	});
});

describe("InviteList", () => {
	it("shows an open Invite's link and revokes it", async () => {
		const onRevoke = jest.fn();
		await render(
			<InviteList
				invites={[invite({ email: "sara@example.com" })]}
				linkFor={(token) => `https://hisaab.app/invite/${token}`}
				now={NOW}
				onRevoke={onRevoke}
			/>,
		);
		expect(screen.getByLabelText("Invite link")).toHaveTextContent(
			`https://hisaab.app/invite/${TOKEN}`,
		);
		await userEvent.press(
			screen.getByRole("button", {
				name: "Revoke the Invite for sara@example.com",
			}),
		);
		expect(onRevoke).toHaveBeenCalledWith("i1");
	});

	it("says why a closed Invite no longer works, without its link", async () => {
		await render(
			<InviteList
				invites={[
					invite({ id: "i2", revoked_at: "2026-10-26T13:00:00.000Z" }),
					invite({
						id: "i3",
						accepted_at: "2026-10-26T13:00:00.000Z",
						accepted_by: "u2",
					}),
					invite({ id: "i4", expires_at: "2026-10-26T11:00:00.000Z" }),
				]}
				linkFor={(token) => token}
				now={NOW}
				onRevoke={() => {}}
			/>,
		);
		expect(screen.getByText("Revoked")).toBeOnTheScreen();
		expect(screen.getByText("Used")).toBeOnTheScreen();
		expect(screen.getByText("Expired")).toBeOnTheScreen();
		expect(screen.queryByLabelText("Invite link")).toBeNull();
		expect(screen.queryByRole("button")).toBeNull();
	});
});

describe("InviteLanding", () => {
	const open: InvitePreview = {
		status: "open",
		householdName: "Family",
		role: "viewer",
		emailRestricted: true,
		expiresAt: "2026-11-02T12:00:00.000Z",
	};

	it("previews the household and Role, then asks a signed-out visitor to sign in", async () => {
		const onSignIn = jest.fn();
		await render(
			<InviteLanding
				failed={false}
				onJoin={async () => ({ status: "signed_out" })}
				onSignIn={onSignIn}
				preview={open}
				signedIn={false}
			/>,
		);
		expect(screen.getByText("Join Family")).toBeOnTheScreen();
		expect(screen.getByText("You're invited as Viewer.")).toBeOnTheScreen();
		expect(screen.getByText(/for one email address/)).toBeOnTheScreen();
		await userEvent.press(
			screen.getByRole("button", { name: "Sign in to join" }),
		);
		expect(onSignIn).toHaveBeenCalled();
	});

	it("joins when signed in", async () => {
		const onJoin = jest.fn(async (): Promise<AcceptResult> => ({
			status: "joined",
			householdId: "h1",
		}));
		await render(
			<InviteLanding
				failed={false}
				onJoin={onJoin}
				onSignIn={() => {}}
				preview={open}
				signedIn
			/>,
		);
		await userEvent.press(screen.getByRole("button", { name: "Join" }));
		expect(onJoin).toHaveBeenCalled();
		expect(await screen.findByRole("status")).toHaveTextContent(/You're in/);
	});

	it("says when the Invite is for another email", async () => {
		await render(
			<InviteLanding
				failed={false}
				onJoin={async () => ({ status: "wrong_email" })}
				onSignIn={() => {}}
				preview={open}
				signedIn
			/>,
		);
		await userEvent.press(screen.getByRole("button", { name: "Join" }));
		expect(await screen.findByRole("alert")).toHaveTextContent(
			/different email/,
		);
		expect(screen.getByRole("button", { name: "Join" })).toBeOnTheScreen();
	});

	it("offers no Join on an Invite that no longer works", async () => {
		await render(
			<InviteLanding
				failed={false}
				onJoin={async () => ({ status: "expired" })}
				onSignIn={() => {}}
				preview={{ ...open, status: "expired" }}
				signedIn
			/>,
		);
		expect(screen.getByRole("alert")).toHaveTextContent(/expired/);
		expect(screen.queryByRole("button", { name: "Join" })).toBeNull();
	});

	it("says when the link is no Invite at all", async () => {
		await render(
			<InviteLanding
				failed={false}
				onJoin={async () => ({ status: "not_found" })}
				onSignIn={() => {}}
				preview={{ status: "not_found" }}
				signedIn
			/>,
		);
		expect(screen.getByRole("alert")).toHaveTextContent(/doesn't work/);
	});
});

describe("JoinWithLinkForm", () => {
	it("opens the Invite a pasted link carries", async () => {
		const onOpen = jest.fn();
		await render(<JoinWithLinkForm onOpen={onOpen} />);
		await userEvent.type(
			screen.getByLabelText("Invite link"),
			`https://hisaab.app/invite/${TOKEN}`,
		);
		await userEvent.press(screen.getByRole("button", { name: "Open Invite" }));
		expect(onOpen).toHaveBeenCalledWith(TOKEN);
	});

	it("says when what's pasted isn't an Invite link", async () => {
		const onOpen = jest.fn();
		await render(<JoinWithLinkForm onOpen={onOpen} />);
		await userEvent.type(screen.getByLabelText("Invite link"), "hello");
		await userEvent.press(screen.getByRole("button", { name: "Open Invite" }));
		expect(screen.getByRole("alert")).toHaveTextContent(/isn't an Invite link/);
		expect(onOpen).not.toHaveBeenCalled();
	});
});
