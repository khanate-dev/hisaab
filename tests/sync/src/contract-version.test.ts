import { describe, expect, it } from "vitest";

import { signInNewUser, userClient } from "./users";

// ADR-0009 through PostgREST: the db_pre_request gate answers too-old or unlabelled clients with 426.

describe("contract version gate", () => {
	it.each([
		["no contract version", null],
		["an older contract version", 0],
	])(
		"answers a request with %s with 426 Update required",
		async (_case, contractVersion) => {
			const api = userClient(await signInNewUser(), contractVersion);
			const { status, error } = await api.from("households").select("id");
			expect(status).toBe(426);
			expect(error).toMatchObject({
				code: "PT426",
				message: "Update required",
			});
		},
	);

	it("lets a current client through to RLS", async () => {
		const { status, data } = await userClient(await signInNewUser())
			.from("households")
			.select("id");
		expect(status).toBe(200);
		expect(data).toHaveLength(1);
	});

	it("gates writes as well as reads", async () => {
		const { status } = await userClient(await signInNewUser(), 0)
			.from("households")
			.update({ name: "Renamed" })
			.neq("id", "")
			.select("id");
		expect(status).toBe(426);
	});

	it("serves app_config to a current client", async () => {
		const { data } = await userClient(await signInNewUser())
			.from("app_config")
			.select("min_contract_version");
		expect(data).toEqual([{ min_contract_version: 1 }]);
	});
});
