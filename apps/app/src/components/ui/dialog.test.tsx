import { describe, expect, it } from "@jest/globals";
import { PortalHost } from "@rn-primitives/portal";
import { render, screen, userEvent } from "@testing-library/react-native";

import { Button } from "./button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogTitle,
	DialogTrigger,
} from "./dialog";

describe("Dialog", () => {
	it("opens from its trigger and closes again", async () => {
		const user = userEvent.setup();
		await render(
			<>
				<Dialog>
					<DialogTrigger asChild>
						<Button>Delete</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogTitle>Delete this Entry?</DialogTitle>
						<DialogClose asChild>
							<Button>Cancel</Button>
						</DialogClose>
					</DialogContent>
				</Dialog>
				<PortalHost />
			</>,
		);

		expect(
			screen.queryByRole("heading", { name: "Delete this Entry?" }),
		).toBeNull();
		await user.press(screen.getByRole("button", { name: "Delete" }));
		expect(
			await screen.findByRole("heading", { name: "Delete this Entry?" }),
		).toBeOnTheScreen();
		await user.press(screen.getByRole("button", { name: "Cancel" }));
		expect(
			screen.queryByRole("heading", { name: "Delete this Entry?" }),
		).toBeNull();
	});
});
