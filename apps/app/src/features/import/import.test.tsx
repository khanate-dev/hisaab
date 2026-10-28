import { describe, expect, it, jest } from "@jest/globals";
import type { ImportMapping } from "@hisaab/domain";
import { PortalHost } from "@rn-primitives/portal";
import { screen, userEvent } from "@testing-library/react-native";

import { makeCategory } from "@/test/categories";
import { render } from "@/test/render";

import { type ImportedRow, ImportWizard } from "./import-wizard";

const categories = [
	makeCategory("c1", "Groceries"),
	makeCategory("c2", "Utilities"),
	makeCategory("c3", "Salary", { kind: "income" }),
];

const STATEMENT = [
	"Date,Details,Amount,Category",
	"2026-10-01,Milk,-450,Groceries",
	"2026-10-02,Electricity,-3200,",
	"2026-10-03,Salary,90000,Salary",
	"2026-10-04,Bread,-120,Groceries",
	"someday,Oops,5,",
].join("\n");

const setup = async (
	props: Partial<Parameters<typeof ImportWizard>[0]> = {},
) => {
	const handlers = {
		onChooseFile: jest.fn(async () => STATEMENT as string | null),
		onImport: jest.fn(
			async (_rows: ImportedRow[], _mapping: ImportMapping) => {},
		),
		onDone: jest.fn(),
	};
	await render(
		<>
			<ImportWizard
				categories={categories}
				currency="PKR"
				// Bread is already in the Wallet: a likely duplicate.
				existing={[{ occurred_on: "2026-10-04", amount: "-120" }]}
				savedMapping={null}
				walletName="HBL"
				{...handlers}
				{...props}
			/>
			<PortalHost />
		</>,
	);
	return { ...handlers, user: userEvent.setup() };
};

describe("ImportWizard", () => {
	it("maps a statement's columns, flags a likely duplicate, asks for missing Categories and imports the rest", async () => {
		const { onImport, onDone, user } = await setup();
		await user.press(screen.getByRole("button", { name: "Choose CSV file" }));
		await user.press(screen.getByRole("button", { name: "Map columns" }));
		// Every column group lists the header's columns; the last group is the optional Category one.
		await user.press(
			screen.getAllByRole("radio", { name: "Category" }).at(-1) ??
				screen.getByText("none"),
		);
		expect(screen.getByRole("status")).toHaveTextContent(
			"4 rows read; 1 can't be, and are left out.",
		);
		await user.press(screen.getByRole("button", { name: "Review rows" }));

		expect(screen.getByText("Likely duplicate")).toBeVisible();
		expect(
			screen.getByRole("checkbox", { name: "Import Bread on Oct 4, 2026" }),
		).not.toBeChecked();
		expect(screen.getByText("1 row still needs a Category.")).toBeVisible();
		expect(
			screen.getByRole("button", { name: "Import 3 Entries" }),
		).toBeDisabled();

		await user.press(
			screen.getByRole("button", {
				name: "Pick a Category for Electricity on Oct 2, 2026",
			}),
		);
		await user.press(screen.getByRole("radio", { name: "Utilities" }));
		await user.press(screen.getByRole("button", { name: "Import 3 Entries" }));

		expect(onImport).toHaveBeenCalledWith(
			[
				{
					occurredOn: "2026-10-01",
					description: "Milk",
					amount: "-450",
					categoryId: "c1",
				},
				{
					occurredOn: "2026-10-02",
					description: "Electricity",
					amount: "-3200",
					categoryId: "c2",
				},
				{
					occurredOn: "2026-10-03",
					description: "Salary",
					amount: "90000",
					categoryId: "c3",
				},
			],
			expect.objectContaining({ hasHeader: true, categoryColumn: 3 }),
		);
		expect(screen.getByRole("status")).toHaveTextContent(
			"Imported 3 Entries into HBL.",
		);
		await user.press(screen.getByRole("button", { name: "Done" }));
		expect(onDone).toHaveBeenCalled();
	});

	it("keeps a likely duplicate when told to", async () => {
		const { onImport, user } = await setup({
			savedMapping: {
				hasHeader: true,
				dateColumn: 0,
				dateFormat: "YYYY-MM-DD",
				descriptionColumn: 1,
				amount: { kind: "single", column: 2, outIsPositive: false },
				categoryColumn: 3,
			},
		});
		await user.press(screen.getByRole("button", { name: "Choose CSV file" }));
		await user.press(screen.getByRole("button", { name: "Map columns" }));
		await user.press(screen.getByRole("button", { name: "Review rows" }));
		await user.press(
			screen.getByRole("checkbox", {
				name: "Import Electricity on Oct 2, 2026",
			}),
		);
		await user.press(
			screen.getByRole("checkbox", { name: "Import Bread on Oct 4, 2026" }),
		);
		await user.press(screen.getByRole("button", { name: "Import 3 Entries" }));
		expect(onImport).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({ description: "Bread", categoryId: "c1" }),
			]),
			expect.anything(),
		);
	});

	it("takes a pasted statement and splits debit and credit columns", async () => {
		const { onImport, user } = await setup({ existing: [] });
		await user.type(
			screen.getByLabelText("Statement CSV"),
			"01/10/2026,Milk,450,\n02/10/2026,Salary,,90000",
		);
		await user.press(screen.getByRole("button", { name: "Map columns" }));
		await user.press(
			screen.getByRole("checkbox", { name: "The first row is a header" }),
		);
		await user.press(screen.getByRole("radio", { name: "DD/MM/YYYY" }));
		await user.press(
			screen.getByRole("radio", { name: "Debit and credit columns" }),
		);
		await user.press(screen.getByRole("button", { name: "Review rows" }));
		await user.press(
			screen.getByRole("button", {
				name: "Pick a Category for Milk on Oct 1, 2026",
			}),
		);
		await user.press(screen.getByRole("radio", { name: "Groceries" }));
		await user.press(
			screen.getByRole("button", {
				name: "Pick a Category for Salary on Oct 2, 2026",
			}),
		);
		await user.press(screen.getByRole("radio", { name: "Salary" }));
		await user.press(screen.getByRole("button", { name: "Import 2 Entries" }));
		expect(onImport).toHaveBeenCalledWith(
			[
				{
					occurredOn: "2026-10-01",
					description: "Milk",
					amount: "-450",
					categoryId: "c1",
				},
				{
					occurredOn: "2026-10-02",
					description: "Salary",
					amount: "90000",
					categoryId: "c3",
				},
			],
			expect.objectContaining({
				dateFormat: "DD/MM/YYYY",
				amount: { kind: "split", debitColumn: 2, creditColumn: 3 },
			}),
		);
	});

	it("says when a picked file can't be read", async () => {
		const { user } = await setup({
			onChooseFile: jest.fn(async (): Promise<string | null> => {
				throw new Error("nope");
			}),
		});
		await user.press(screen.getByRole("button", { name: "Choose CSV file" }));
		expect(screen.getByRole("alert")).toHaveTextContent(/couldn't be read/);
	});
});
