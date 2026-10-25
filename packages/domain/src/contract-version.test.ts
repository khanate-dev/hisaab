import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	CONTRACT_VERSION_HEADER,
	checkContractVersion,
	contractVersionResponse,
} from "./contract-version";

const version = fc.integer({ min: 1, max: 1_000_000 });

describe("checkContractVersion", () => {
	it("lets through any client at or above the minimum", () => {
		fc.assert(
			fc.property(version, fc.nat(1_000), (minimum, ahead) => {
				expect(checkContractVersion(String(minimum + ahead), minimum)).toEqual({
					ok: true,
				});
			}),
		);
	});

	it("stops any client below the minimum", () => {
		fc.assert(
			fc.property(version, version, (minimum, sent) => {
				fc.pre(sent < minimum);
				expect(checkContractVersion(String(sent), minimum)).toMatchObject({
					ok: false,
					sent,
					minimum,
				});
			}),
		);
	});

	it("stops a client that sends no version or a malformed one", () => {
		fc.assert(
			fc.property(
				version,
				fc.oneof(
					fc.constant(null),
					fc.string().filter((s) => !/^[0-9]+$/.test(s)),
					fc.constantFrom("", " 1", "1.0", "-1", "1e3"),
				),
				(minimum, sent) => {
					expect(checkContractVersion(sent, minimum)).toMatchObject({
						ok: false,
						sent: null,
						minimum,
					});
				},
			),
		);
	});
});

describe("contractVersionResponse", () => {
	const request = (sent?: string) =>
		new Request("https://example.test/functions/v1/anything", {
			headers: sent === undefined ? {} : { [CONTRACT_VERSION_HEADER]: sent },
		});

	it("answers a too-old client with 426 Update required", async () => {
		const response = contractVersionResponse(request("1"), 2);
		expect(response?.status).toBe(426);
		expect(await response?.json()).toMatchObject({
			code: "PT426",
			message: "Update required",
		});
	});

	it("answers a client without the header with 426", () => {
		expect(contractVersionResponse(request(), 1)?.status).toBe(426);
	});

	it("lets a current client through", () => {
		expect(contractVersionResponse(request("2"), 2)).toBeNull();
	});
});
