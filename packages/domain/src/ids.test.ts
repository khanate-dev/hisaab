import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { uuidv7 } from "./ids";

// ADR-0001: ids are client-generated UUIDv7 (RFC 9562): a 48-bit millisecond timestamp, then random bits.

const UUID_V7 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const time = fc.integer({ min: 0, max: 2 ** 48 - 1 });
const random = fc.uint8Array({ minLength: 10, maxLength: 10 });

describe("uuidv7", () => {
	it("has the UUIDv7 layout: version 7, RFC variant", () => {
		fc.assert(
			fc.property(time, random, (now, bytes) => {
				expect(uuidv7(now, bytes)).toMatch(UUID_V7);
			}),
		);
	});

	it("carries the millisecond timestamp in its first 48 bits", () => {
		fc.assert(
			fc.property(time, random, (now, bytes) => {
				expect(
					Number.parseInt(
						uuidv7(now, bytes).replaceAll("-", "").slice(0, 12),
						16,
					),
				).toBe(now);
			}),
		);
	});

	it("sorts by creation time", () => {
		fc.assert(
			fc.property(time, time, random, random, (a, b, bytesA, bytesB) => {
				fc.pre(a !== b);
				const [earlier, later] =
					a < b
						? [uuidv7(a, bytesA), uuidv7(b, bytesB)]
						: [uuidv7(b, bytesB), uuidv7(a, bytesA)];
				expect(earlier < later).toBe(true);
			}),
		);
	});

	it("differs whenever the random bits it uses do", () => {
		fc.assert(
			fc.property(time, random, random, (now, a, b) => {
				// The version and variant overwrite the top bits of bytes 0 and 2; every other bit is used whole.
				fc.pre(a.some((byte, i) => i !== 0 && i !== 2 && byte !== b[i]));
				expect(uuidv7(now, a)).not.toBe(uuidv7(now, b));
			}),
		);
	});
});
