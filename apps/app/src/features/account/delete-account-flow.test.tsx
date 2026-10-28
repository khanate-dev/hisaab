import { describe, expect, it, jest } from "@jest/globals";
import type { DeleteAccountAnswer } from "@hisaab/domain";
import { screen, userEvent } from "@testing-library/react-native";
import { Text } from "react-native";

import { render } from "@/test/render";

import { DeleteAccountFlow } from "./delete-account-flow";

const setup = async ({
	email = "leila@example.com",
	blockers = [] as { householdId: string; name: string }[][],
	answers = [{ status: "deleted" }] as DeleteAccountAnswer[],
	verify = async (_code: string) => {},
} = {}) => {
	const handlers = {
		onCheck: jest.fn(async () => blockers.shift() ?? []),
		onFix: jest.fn(),
		onSendCode: jest.fn(async () => {}),
		onVerify: jest.fn(verify),
		onDelete: jest.fn(
			async (_typed: string) =>
				answers.shift() ?? { status: "deleted" as const },
		),
		onDeleted: jest.fn(),
	};
	await render(
		<DeleteAccountFlow
			backup={<Text>Backup offered</Text>}
			email={email}
			{...handlers}
		/>,
	);
	return { ...handlers, user: userEvent.setup() };
};
const press = (
	user: ReturnType<typeof userEvent.setup>,
	name: string | RegExp,
) => screen.findByRole("button", { name }).then((button) => user.press(button));

const toCode = async (user: ReturnType<typeof userEvent.setup>) => {
	await press(user, "Continue");
	await press(user, "Email me a code");
	await user.type(await screen.findByLabelText("Code"), "123456");
	await press(user, "Confirm");
};

describe("DeleteAccountFlow", () => {
	it("offers a Full backup first, and says what deleting does", async () => {
		await setup();
		expect(screen.getByText("Backup offered")).toBeVisible();
		expect(screen.getByText(/can't be undone/)).toBeVisible();
	});

	it("deletes after a fresh code and the typed confirmation, and only then", async () => {
		const { user, onSendCode, onVerify, onDelete, onDeleted } = await setup();
		await toCode(user);
		expect(onSendCode).toHaveBeenCalled();
		expect(onVerify).toHaveBeenCalledWith("123456");
		const remove = await screen.findByRole("button", {
			name: "Delete my account",
		});
		expect(remove).toBeDisabled();
		await user.type(screen.getByLabelText("Confirmation"), "delete");
		expect(remove).toBeDisabled();
		await user.clear(screen.getByLabelText("Confirmation"));
		await user.type(screen.getByLabelText("Confirmation"), "DELETE");
		await user.press(remove);
		expect(onDelete).toHaveBeenCalledWith("DELETE");
		expect(onDeleted).toHaveBeenCalled();
	});

	it("lists the households in the way, with both fixes, until they're sorted", async () => {
		const { user, onFix } = await setup({
			blockers: [[{ householdId: "h1", name: "Family" }], []],
		});
		await press(user, "Continue");
		expect(await screen.findByText("Family")).toBeVisible();
		await press(user, "Make someone else an Admin");
		expect(onFix).toHaveBeenCalledWith("h1", "promote");
		await press(user, "Delete the household");
		expect(onFix).toHaveBeenCalledWith("h1", "delete");
		await press(user, "Check again");
		expect(
			await screen.findByRole("button", { name: "Email me a code" }),
		).toBeVisible();
	});

	it("asks for a new code when the last one's too old by the time it's deleted", async () => {
		const { user, onDeleted } = await setup({
			answers: [{ status: "stale_otp" }],
		});
		await toCode(user);
		await user.type(await screen.findByLabelText("Confirmation"), "DELETE");
		await press(user, "Delete my account");
		expect(await screen.findByRole("alert")).toHaveTextContent(/new code/);
		expect(
			screen.getByRole("button", { name: "Email me a code" }),
		).toBeVisible();
		expect(onDeleted).not.toHaveBeenCalled();
	});

	it("says when a code doesn't work", async () => {
		const { user } = await setup({
			verify: async () => {
				throw new Error("bad code");
			},
		});
		await toCode(user);
		expect(await screen.findByRole("alert")).toHaveTextContent(
			/code didn't work/,
		);
		expect(screen.queryByLabelText("Confirmation")).toBeNull();
	});

	it("says when there's no email to send a code to", async () => {
		const { user, onSendCode } = await setup({ email: "" });
		await press(user, "Continue");
		expect(await screen.findByRole("alert")).toHaveTextContent(/no email/);
		expect(
			screen.queryByRole("button", { name: "Email me a code" }),
		).toBeNull();
		expect(onSendCode).not.toHaveBeenCalled();
	});
});
