import { describe, expect, it } from "@jest/globals";
import { PortalHost } from "@rn-primitives/portal";
import { screen, userEvent } from "@testing-library/react-native";

import { Button } from "./button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "./sheet";
import { render } from "@/test/render";

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
