import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CONTRACT_VERSION } from "./contract-version";
import { type QueuedOp, type Upcasters, UPCASTERS, upcast } from "./upcasters";

const queuedOp: fc.Arbitrary<QueuedOp> = fc.record({
	table: fc.constantFrom("households", "memberships"),
	op: fc.constantFrom("PUT" as const, "PATCH" as const, "DELETE" as const),
	id: fc.uuid(),
	data: fc.option(
		fc.dictionary(
			fc.string({ minLength: 1 }),
			fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
		),
	),
});

const tag =
	(version: number) =>
	(op: QueuedOp): QueuedOp => ({
		...op,
		data: { ...op.data, steps: `${op.data?.["steps"] ?? ""}${version}` },
	});

describe("upcast", () => {
	it("leaves an op already at the target version unchanged", () => {
		fc.assert(
			fc.property(queuedOp, fc.integer({ min: 1, max: 50 }), (op, version) => {
				expect(upcast(op, version, version, {})).toEqual(op);
			}),
		);
	});

	it("runs every step from the op's version up to the target, in order", () => {
		fc.assert(
			fc.property(
				queuedOp,
				fc.integer({ min: 1, max: 10 }),
				fc.integer({ min: 0, max: 10 }),
				(op, from, span) => {
					const to = from + span;
					const registry: Upcasters = Object.fromEntries(
						Array.from({ length: span }, (_, i) => [
							from + 1 + i,
							tag(from + 1 + i),
						]),
					);
					const steps = Array.from(
						{ length: span },
						(_, i) => from + 1 + i,
					).join("");
					const result = upcast(op, from, to, registry);
					expect(span === 0 ? result : result?.data?.["steps"]).toEqual(
						span === 0 ? op : steps,
					);
				},
			),
		);
	});

	it("can't map an op when a step is missing", () => {
		fc.assert(
			fc.property(
				queuedOp,
				fc.integer({ min: 1, max: 10 }),
				fc.integer({ min: 1, max: 10 }),
				(op, from, span) => {
					expect(upcast(op, from, from + span, {})).toBeNull();
				},
			),
		);
	});

	it("can't map an op written by a newer build than this one", () => {
		fc.assert(
			fc.property(
				queuedOp,
				fc.integer({ min: 1, max: 10 }),
				fc.integer({ min: 1, max: 10 }),
				(op, to, ahead) => {
					expect(upcast(op, to + ahead, to, UPCASTERS)).toBeNull();
				},
			),
		);
	});

	it("can't map an op a step refuses", () => {
		expect(
			upcast({ table: "households", op: "PUT", id: "h", data: {} }, 1, 2, {
				2: () => null,
			}),
		).toBeNull();
	});
});

describe("UPCASTERS", () => {
	it("has a step for every contract version bump, so every older op can reach this build", () => {
		for (let version = 2; version <= CONTRACT_VERSION; version += 1) {
			expect(
				UPCASTERS[version],
				`upcaster to contract version ${version}`,
			).toBeTypeOf("function");
		}
	});

	it("maps every op from the first contract version to this build", () => {
		fc.assert(
			fc.property(queuedOp, (op) => {
				expect(upcast(op, 1, CONTRACT_VERSION, UPCASTERS)).not.toBeNull();
			}),
		);
	});
});
