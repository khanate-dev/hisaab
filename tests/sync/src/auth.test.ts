import { describe, expect, it } from "vitest";

import { openSyncStream, signInNewUser } from "./local-stack";

// An ES256 signature is 64 bytes: 86 base64url characters.
const FORGED_SIGNATURE = "A".repeat(86);

const jwtHeader = (jwt: string) =>
	JSON.parse(Buffer.from(jwt.split(".")[0] ?? "", "base64url").toString()) as {
		alg: string;
	};

describe("local stack auth", () => {
	it("issues ES256 access tokens", async () => {
		expect(jwtHeader(await signInNewUser()).alg).toBe("ES256");
	});

	it("lets PowerSync verify a local Supabase token through JWKS", async () => {
		const { status, body } = await openSyncStream(await signInNewUser());
		expect(body).not.toContain("PSYNC_S2101");
		expect(status).toBe(200);
	});

	it("rejects a token with a forged signature", async () => {
		const [head, payload] = (await signInNewUser()).split(".");
		const { status, body } = await openSyncStream(
			`${head}.${payload}.${FORGED_SIGNATURE}`,
		);
		expect(status).toBe(401);
		expect(body).toContain("PSYNC_S2101");
	});
});
