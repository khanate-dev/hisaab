import { describe, expect, it, jest } from "@jest/globals";
import {
	BACKUP_TABLES,
	type BackupRow,
	type BackupTable,
	backupJson,
	buildBackup,
} from "@hisaab/domain";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import { FullBackupSection } from "./full-backup-section";
import { RestoreForm } from "./restore-form";
import { packBackup, type UnpackedBackup, unpackBackup } from "./zip";

type Problem = Extract<UnpackedBackup, { problem: string }>["problem"];

const tables = () => {
	const t = Object.fromEntries(
		BACKUP_TABLES.map((name) => [name, []]),
	) as unknown as Record<BackupTable, BackupRow[]>;
	t.wallets = [{ id: "w1", name: "Cash" }];
	t.entries = [
		{ id: "e1", amount: "-100.00" },
		{ id: "e2", amount: "-5.50" },
	];
	t.attachments = [{ id: "a1", media_type: "image/jpeg", purged_at: null }];
	return t;
};
const backup = buildBackup(
	{
		name: "Family",
		base_currency: "PKR",
		timezone: "Asia/Karachi",
		budget_month_start_day: 1,
	},
	tables(),
	"2026-10-28T09:00:00.000Z",
);

describe("Full backup ZIP", () => {
	it("unpacks to the records and Attachment files it was packed from", () => {
		const photo = new Uint8Array([1, 2, 3, 250]);
		const unpacked = unpackBackup(
			packBackup(backupJson(backup), [
				{ id: "a1", extension: "jpg", bytes: photo },
			]),
		);
		expect(unpacked).toEqual({ backup, files: new Map([["a1", photo]]) });
	});

	it("says a file that isn't one isn't one", () => {
		expect(unpackBackup(new Uint8Array([1, 2, 3]))).toEqual({
			problem: "not_a_backup",
		});
		expect(unpackBackup(packBackup("{}", []))).toEqual({
			problem: "not_a_backup",
		});
	});
});

describe("FullBackupSection", () => {
	it("makes the backup when pressed, and says it's made", async () => {
		const onMake = jest.fn(async () => {});
		await render(<FullBackupSection onMake={onMake} />);
		await userEvent
			.setup()
			.press(screen.getByRole("button", { name: "Make a Full backup" }));
		expect(onMake).toHaveBeenCalledTimes(1);
		expect(await screen.findByText("The Full backup is made.")).toBeVisible();
	});

	it("says when it couldn't, as when offline with Attachments", async () => {
		await render(
			<FullBackupSection
				onMake={async () => {
					throw new Error("offline");
				}}
			/>,
		);
		await userEvent
			.setup()
			.press(screen.getByRole("button", { name: "Make a Full backup" }));
		expect(await screen.findByRole("alert")).toHaveTextContent(
			/Couldn't make the backup/,
		);
	});
});

describe("RestoreForm", () => {
	const chosen: UnpackedBackup = {
		backup,
		files: new Map([["a1", new Uint8Array([1])]]),
	};

	it("shows what's in the backup and restores it under the name given", async () => {
		const onRestore = jest.fn(async (_chosen: unknown, _name: string) => {});
		await render(
			<RestoreForm
				onChoose={async () => chosen}
				onRestore={onRestore}
			/>,
		);
		const user = userEvent.setup();
		await user.press(
			screen.getByRole("button", { name: "Choose a Full backup" }),
		);
		expect(
			await screen.findByText(/1 Wallets, 2 Entries and 1 Attachment files\./),
		).toBeVisible();
		const name = screen.getByLabelText("New household's name");
		expect(name).toHaveDisplayValue("Family (restored)");
		await user.clear(name);
		await user.type(name, "Family again");
		await user.press(
			screen.getByRole("button", { name: "Restore into a new household" }),
		);
		expect(onRestore).toHaveBeenCalledWith(chosen, "Family again");
	});

	it("restores nothing without a name", async () => {
		await render(
			<RestoreForm
				onChoose={async () => chosen}
				onRestore={async () => {}}
			/>,
		);
		const user = userEvent.setup();
		await user.press(
			screen.getByRole("button", { name: "Choose a Full backup" }),
		);
		await user.clear(await screen.findByLabelText("New household's name"));
		expect(
			screen.getByRole("button", { name: "Restore into a new household" }),
		).toBeDisabled();
	});

	it.each([
		["not_a_backup", /isn't a Hisaab Full backup/],
		["newer_version", /newer version of Hisaab/],
		["damaged", /damaged/],
	] satisfies [Problem, RegExp][])(
		"says why a file can't be restored (%s)",
		async (problem, said) => {
			await render(
				<RestoreForm
					onChoose={async () => ({ problem })}
					onRestore={async () => {}}
				/>,
			);
			await userEvent
				.setup()
				.press(screen.getByRole("button", { name: "Choose a Full backup" }));
			expect(await screen.findByRole("alert")).toHaveTextContent(said);
			expect(
				screen.queryByRole("button", { name: "Restore into a new household" }),
			).toBeNull();
		},
	);

	it("says when restoring failed", async () => {
		await render(
			<RestoreForm
				onChoose={async () => chosen}
				onRestore={async () => {
					throw new Error("no");
				}}
			/>,
		);
		const user = userEvent.setup();
		await user.press(
			screen.getByRole("button", { name: "Choose a Full backup" }),
		);
		await user.press(
			await screen.findByRole("button", {
				name: "Restore into a new household",
			}),
		);
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"That didn't restore. Try again.",
		);
	});
});
