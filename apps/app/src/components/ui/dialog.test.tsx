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
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "./sheet";

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

		expect(screen.queryByText("Delete this Entry?")).toBeNull();
		await user.press(screen.getByRole("button", { name: "Delete" }));
		expect(await screen.findByText("Delete this Entry?")).toBeOnTheScreen();
		await user.press(screen.getByRole("button", { name: "Cancel" }));
		expect(screen.queryByText("Delete this Entry?")).toBeNull();
	});
});

describe("Sheet", () => {
	it("opens from its trigger with a close button of its own", async () => {
		const user = userEvent.setup();
		await render(
			<>
				<Sheet>
					<SheetTrigger asChild>
						<Button>Sync status</Button>
					</SheetTrigger>
					<SheetContent>
						<SheetTitle>Sync status</SheetTitle>
					</SheetContent>
				</Sheet>
				<PortalHost />
			</>,
		);

		await user.press(screen.getByRole("button", { name: "Sync status" }));
		expect(
			await screen.findByRole("heading", { name: "Sync status" }),
		).toBeOnTheScreen();
		await user.press(screen.getByRole("button", { name: "Close" }));
		expect(screen.queryByRole("heading", { name: "Sync status" })).toBeNull();
	});
});
