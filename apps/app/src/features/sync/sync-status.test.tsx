import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";

import { SyncStatus } from "./sync-status";
import { render } from "@/test/render";

const rejectedChange = {
	id: "1:1",
	table_name: "households",
	row_id: "h1",
	op: "PATCH" as const,
	code: "no_rows",
	message: "The server didn't accept this change.",
	data: '{"name":"Home"}',
	created_at: "2026-10-26T10:00:00.000Z",
};

describe("SyncStatus", () => {
	it("lists each change that couldn't sync with why, and lets the User dismiss it", async () => {
		const onDismiss = jest.fn((_id: string) => {});
		await render(
			<SyncStatus
				connected
				onDismiss={onDismiss}
				rejectedChanges={[
					rejectedChange,
					{
						...rejectedChange,
						id: "1:2",
						op: "PUT",
						code: "42501",
						message: "denied",
					},
				]}
			/>,
		);

		const dismiss = screen.getAllByRole("button", { name: /^dismiss/i });
		expect(dismiss).toHaveLength(2);
		expect(
			screen.getByRole("button", { name: /^dismiss: change to a household$/i }),
		).toBeOnTheScreen();
		expect(
			screen.getByRole("button", { name: /^dismiss: new household$/i }),
		).toBeOnTheScreen();
		expect(
			screen.getByText(/no permission, or someone else deleted it/i),
		).toBeOnTheScreen();
		expect(screen.getByText(/^no permission\.$/i)).toBeOnTheScreen();

		await userEvent.setup().press(
			screen.getByRole("button", {
				name: /^dismiss: change to a household$/i,
			}),
		);
		expect(onDismiss).toHaveBeenCalledWith("1:1");
	});

	it("says everything synced when nothing was rejected", async () => {
		await render(
			<SyncStatus
				connected
				onDismiss={() => {}}
				rejectedChanges={[]}
			/>,
		);
		expect(screen.getByRole("status")).toHaveTextContent(
			/online.*every change synced/i,
		);
		expect(screen.queryByRole("list")).toBeNull();
	});

	it("says when the device is offline", async () => {
		await render(
			<SyncStatus
				connected={false}
				onDismiss={() => {}}
				rejectedChanges={[]}
			/>,
		);
		expect(screen.getByRole("status")).toHaveTextContent(/offline/i);
	});
});
