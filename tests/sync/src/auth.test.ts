import { describe, expect, it } from "vitest";

import { openSyncStream, signInNewUser } from "./local-stack";

const header = (jwt: string) =>
	JSON.parse(Buffer.from(jwt.split(".")[0] ?? "", "base64url").toString()) as {
		alg: string;
	};

describe("local stack auth", () => {
	it("issues ES256 access tokens", async () => {
		expect(header(await signInNewUser()).alg).toBe("ES256");
	});

	it("lets PowerSync verify a local Supabase token through JWKS", async () => {
		const { status, body } = await openSyncStream(await signInNewUser());
		expect(body).not.toContain("PSYNC_S2101");
		expect(status).toBe(200);
	});

	it("rejects a token with a forged signature", async () => {
		const [head, payload] = (await signInNewUser()).split(".");
		const { status, body } = await openSyncStream(
			`${head}.${payload}.${"A".repeat(86)}`,
		);
		expect(status).toBe(401);
		expect(body).toContain("PSYNC_S2101");
	});
});
