import { describe, expect, it } from "vitest";

import { connectClient } from "./powersync";
import { signInNewUser } from "./users";

describe("sync harness", () => {
	it("connects a @powersync/node client with the app's client schema", async () => {
		const client = await connectClient(await signInNewUser());
		expect(client.currentStatus.connected).toBe(true);
		expect(client.currentStatus.hasSynced).toBe(true);
	});
});
