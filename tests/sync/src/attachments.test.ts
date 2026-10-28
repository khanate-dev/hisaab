import { v7 as uuidv7 } from "uuid";
import { beforeAll, describe, expect, it } from "vitest";

import { seedHousehold } from "./seed";
import { adminClient, signInNewUser, userClient } from "./users";

// Attachment files (spec §3.4) live in the private `attachments` bucket under the household's folder: its Admins and
// Members upload and remove them, everyone in it reads them, nobody else gets near them.
describe("Attachment files", () => {
	let seed: Awaited<ReturnType<typeof seedHousehold<"member" | "viewer">>>;
	const file = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
		type: "image/jpeg",
	});

	beforeAll(async () => {
		seed = await seedHousehold({ member: "member", viewer: "viewer" });
	});

	/** An Attachment row on one of the household's Entries, as a device would upload it first; returns its file's path. */
	const attachment = async (extension = "jpg", mediaType = "image/jpeg") => {
		const admin = adminClient();
		const wallet = {
			id: uuidv7(),
			household_id: seed.household,
			name: "Cash",
			type: "cash",
			currency: "PKR",
		};
		const walletRow = await admin.from("wallets").insert(wallet);
		if (walletRow.error) throw walletRow.error;
		const entryId = uuidv7();
		const entry = await admin.from("entries").insert({
			id: entryId,
			household_id: seed.household,
			wallet_id: wallet.id,
			kind: "balance_adjustment",
			amount: "1",
			occurred_on: "2026-10-28",
			created_by: seed.users.member.id,
		});
		if (entry.error) throw entry.error;
		const id = uuidv7();
		const row = await admin.from("attachments").insert({
			id,
			household_id: seed.household,
			entry_id: entryId,
			media_type: mediaType,
			size_bytes: 4,
			created_by: seed.users.member.id,
		});
		if (row.error) throw row.error;
		return `${seed.household}/${id}.${extension}`;
	};

	it("upload once their row is there, under the household's folder, for its Members to read and nobody else", async () => {
		const member = userClient(seed.users.member).storage.from("attachments");
		expect(
			(await member.upload(`${seed.household}/${uuidv7()}.jpg`, file)).error,
		).not.toBeNull();

		const path = await attachment();
		const uploaded = await member.upload(path, file, {
			contentType: "image/jpeg",
		});
		expect(uploaded.error).toBeNull();

		const viewer = userClient(seed.users.viewer).storage.from("attachments");
		const read = await viewer.download(path);
		expect(read.error).toBeNull();
		expect(
			(await viewer.upload(`${seed.household}/${uuidv7()}.jpg`, file)).error,
		).not.toBeNull();

		const outsider = userClient(await signInNewUser()).storage.from(
			"attachments",
		);
		expect((await outsider.download(path)).error).not.toBeNull();
		expect(
			(await outsider.upload(`${seed.household}/${uuidv7()}.jpg`, file)).error,
		).not.toBeNull();

		expect((await member.remove([path])).error).toBeNull();
	});

	it("take only images and PDFs", async () => {
		const member = userClient(seed.users.member).storage.from("attachments");
		const text = new Blob(["hello"], { type: "text/plain" });
		const { error } = await member.upload(
			`${seed.household}/${uuidv7()}.txt`,
			text,
			{ contentType: "text/plain" },
		);
		expect(error).not.toBeNull();
	});
});
