import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	ATTACHMENT_MEDIA_TYPES,
	attachmentKind,
	attachmentPath,
	attachmentProblem,
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENTS,
	shrunkSize,
} from "./attachments";

const edge = fc.integer({ min: 1, max: 20_000 });

describe("shrunkSize", () => {
	it("brings the long edge within the limit, never enlarging, keeping the shape", () => {
		fc.assert(
			fc.property(
				edge,
				edge,
				fc.integer({ min: 16, max: 4000 }),
				(width, height, longEdge) => {
					const out = shrunkSize(width, height, longEdge);
					expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(
						Math.max(longEdge, 1),
					);
					expect(out.width).toBeLessThanOrEqual(width);
					expect(out.height).toBeLessThanOrEqual(height);
					expect(Math.min(out.width, out.height)).toBeGreaterThanOrEqual(1);
					if (Math.max(width, height) <= longEdge)
						expect(out).toEqual({ width, height });
					// The shape holds to within rounding of a pixel on the short edge.
					else if (width >= height)
						expect(
							Math.abs(out.height - (height * out.width) / width),
						).toBeLessThanOrEqual(1);
					else
						expect(
							Math.abs(out.width - (width * out.height) / height),
						).toBeLessThanOrEqual(1);
				},
			),
		);
	});
});

describe("attachmentProblem", () => {
	it("allows up to five images or PDFs of at most about 10 MB", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 8 }),
				fc.constantFrom(...ATTACHMENT_MEDIA_TYPES, "text/plain", "video/mp4"),
				fc.integer({ min: 0, max: 2 * MAX_ATTACHMENT_BYTES }),
				(count, mediaType, bytes) => {
					const problem = attachmentProblem(count, { mediaType, bytes });
					const ok =
						count < MAX_ATTACHMENTS &&
						attachmentKind(mediaType) !== null &&
						bytes <= MAX_ATTACHMENT_BYTES;
					expect(problem === null).toBe(ok);
				},
			),
		);
	});
});

describe("attachmentPath", () => {
	it("files an Attachment under its household, by its id", () => {
		expect(attachmentPath("h1", "a1", "image/jpeg")).toBe("h1/a1.jpg");
		expect(attachmentPath("h1", "a2", "application/pdf")).toBe("h1/a2.pdf");
	});
});
