import { describe, expect, it } from "vitest";

import { connectClient } from "./local-stack";

describe("sync harness", () => {
	it("connects a @powersync/node client with the app's client schema", async () => {
		const client = await connectClient();
		try {
			expect(client.currentStatus.connected).toBe(true);
			expect(client.currentStatus.hasSynced).toBe(true);
		} finally {
			await client.disconnectAndClear();
			await client.close();
		}
	});
});
