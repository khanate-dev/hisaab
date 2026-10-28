import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	type HouseholdFacts,
	loanDueWhen,
	type RaiseAdapters,
	type RaisedNotification,
	raiseScheduledNotifications,
	scheduledNotifications,
} from "./notification-triggers";
import { pushMessage, readEventPayload } from "./notifications";

const ADMIN = "u-admin";
const MEMBER = "u-member";
const VIEWER = "u-viewer";

const household = (facts: Partial<HouseholdFacts> = {}): HouseholdFacts => ({
	householdId: "h1",
	householdName: "Family",
	today: "2026-11-10",
	members: [
		{ userId: ADMIN, role: "admin" },
		{ userId: MEMBER, role: "member" },
		{ userId: VIEWER, role: "viewer" },
	],
	occurrences: [],
	loans: [],
	budgets: [],
	...facts,
});

const occurrence = (
	o: Partial<HouseholdFacts["occurrences"][number]> = {},
): HouseholdFacts["occurrences"][number] => ({
	ruleId: "r1",
	mode: "confirm",
	createdBy: MEMBER,
	ruleName: "Rent",
	categoryName: "Housing",
	dueOn: "2026-11-10",
	state: "pending",
	snoozedUntil: null,
	followers: [],
	...o,
});

const summary = (raised: RaisedNotification[]) =>
	raised.map((n) => `${n.trigger} ${n.userId} ${n.dedupeKey}`);

describe("scheduledNotifications", () => {
	it("tells a Recurring rule's maker it's due, and again if it's still Pending 3 days on", () => {
		expect(
			summary(
				scheduledNotifications(
					household({
						occurrences: [
							occurrence(),
							occurrence({ ruleId: "r2", dueOn: "2026-11-07" }),
							// Handled, or not yet a reminder: nothing.
							occurrence({ ruleId: "r3", state: "confirmed" }),
							occurrence({
								ruleId: "r4",
								state: "skipped",
								dueOn: "2026-11-07",
							}),
							occurrence({ ruleId: "r5", dueOn: "2026-11-08" }),
							// Snoozed a month ago to today: due again.
							occurrence({
								ruleId: "r6",
								dueOn: "2026-10-10",
								snoozedUntil: "2026-11-10",
							}),
						],
					}),
				),
			),
		).toEqual([
			`recurring_due ${MEMBER} recurring_due/r1/2026-11-10`,
			`recurring_due ${MEMBER} recurring_due/r2/2026-11-07/reminder`,
			`recurring_due ${MEMBER} recurring_due/r6/2026-10-10/snooze/2026-11-10`,
		]);
	});

	it("tells an Auto-record rule's maker what it recorded today", () => {
		expect(
			summary(
				scheduledNotifications(
					household({
						occurrences: [
							occurrence({ mode: "auto", state: "confirmed" }),
							// Left Pending (say its Wallet was archived), or recorded another day: nothing.
							occurrence({ ruleId: "r2", mode: "auto", state: "pending" }),
							occurrence({
								ruleId: "r3",
								mode: "auto",
								state: "confirmed",
								dueOn: "2026-11-09",
							}),
						],
					}),
				),
			),
		).toEqual([`auto_recorded ${MEMBER} auto_recorded/r1/2026-11-10`]);
	});

	it("tells Admins and Members, never Viewers, of a Budget passed and a Loan due", () => {
		expect(
			summary(
				scheduledNotifications(
					household({
						budgets: [
							{
								categoryId: "c1",
								categoryName: "Groceries",
								month: "2026-11",
								level: 80,
							},
						],
						loans: [
							{
								loanId: "l1",
								contactName: "Bilal",
								direction: "lent",
								dueOn: "2026-11-13",
							},
							// Due in 2 days: not today's to mention.
							{
								loanId: "l2",
								contactName: "Sara",
								direction: "borrowed",
								dueOn: "2026-11-12",
							},
						],
					}),
				),
			),
		).toEqual([
			`budget_threshold ${ADMIN} budget_threshold/c1/2026-11/80`,
			`budget_threshold ${MEMBER} budget_threshold/c1/2026-11/80`,
			`loan_due ${ADMIN} loan_due/l1/2026-11-10`,
			`loan_due ${MEMBER} loan_due/l1/2026-11-10`,
		]);
	});

	it("tells the rule's followers too, once each, alongside its maker", () => {
		expect(
			summary(
				scheduledNotifications(
					household({
						occurrences: [
							occurrence({ followers: [ADMIN, MEMBER, "u-gone"] }),
							occurrence({
								ruleId: "r2",
								mode: "auto",
								state: "confirmed",
								followers: [ADMIN],
							}),
						],
					}),
				),
			),
		).toEqual([
			`recurring_due ${MEMBER} recurring_due/r1/2026-11-10`,
			`recurring_due ${ADMIN} recurring_due/r1/2026-11-10`,
			`auto_recorded ${MEMBER} auto_recorded/r2/2026-11-10`,
			`auto_recorded ${ADMIN} auto_recorded/r2/2026-11-10`,
		]);
	});

	it("tells nobody who's no longer in the household", () => {
		expect(
			scheduledNotifications(
				household({ occurrences: [occurrence({ createdBy: "u-gone" })] }),
			),
		).toEqual([]);
	});

	const facts = fc.record({
		householdId: fc.uuid(),
		householdName: fc.string(),
		today: fc
			.date({
				min: new Date("2000-01-01"),
				max: new Date("2099-12-31"),
				noInvalidDate: true,
			})
			.map((d) => d.toISOString().slice(0, 10)),
		members: fc.uniqueArray(
			fc.record({
				userId: fc.constantFrom(ADMIN, MEMBER, VIEWER, "u4"),
				role: fc.constantFrom(
					"admin" as const,
					"member" as const,
					"viewer" as const,
				),
			}),
			{ selector: (m) => m.userId },
		),
		occurrences: fc.uniqueArray(
			fc.record({
				ruleId: fc.uuid(),
				mode: fc.constantFrom("confirm" as const, "auto" as const),
				createdBy: fc.constantFrom(ADMIN, MEMBER, VIEWER, "u4", "u-gone"),
				ruleName: fc.string(),
				categoryName: fc.string(),
				dueOn: fc.constant("2026-11-10"),
				snoozedUntil: fc.constant(null),
				followers: fc.uniqueArray(
					fc.constantFrom(ADMIN, MEMBER, VIEWER, "u-gone"),
				),
				state: fc.constantFrom(
					"pending" as const,
					"confirmed" as const,
					"skipped" as const,
					"snoozed" as const,
				),
			}),
			{ selector: (row) => row.ruleId },
		),
		loans: fc.uniqueArray(
			fc.record({
				loanId: fc.uuid(),
				contactName: fc.string(),
				direction: fc.constantFrom("lent" as const, "borrowed" as const),
				dueOn: fc.constant("2026-11-10"),
			}),
			{ selector: (row) => row.loanId },
		),
		budgets: fc.uniqueArray(
			fc.record({
				categoryId: fc.uuid(),
				categoryName: fc.string(),
				month: fc.constant("2026-11"),
				level: fc.constantFrom(80 as const, 100 as const),
			}),
			{ selector: (row) => row.categoryId },
		),
	});
	// Move each Occurrence and Loan to a date near today.
	const nearToday = fc
		.tuple(
			facts,
			fc.array(fc.integer({ min: -30, max: 5 }), {
				minLength: 40,
				maxLength: 40,
			}),
		)
		.map(([f, offsets]) => {
			const near = (i: number) =>
				new Date(
					Date.parse(f.today) + (offsets[i % offsets.length] ?? 0) * 86_400_000,
				)
					.toISOString()
					.slice(0, 10);
			return {
				...f,
				occurrences: f.occurrences.map((o, i) => ({
					...o,
					dueOn: near(i),
					snoozedUntil: i % 5 === 0 ? f.today : null,
				})),
				loans: f.loans.map((l, i) => ({ ...l, dueOn: near(i + 20) })),
			};
		});

	it("raises each only to someone in the household, Budgets and Loans never to a Viewer, each once a User", () => {
		fc.assert(
			fc.property(nearToday, (f) => {
				const raised = scheduledNotifications(f);
				const roles = new Map<string, string>(
					f.members.map((m) => [m.userId, m.role]),
				);
				for (const n of raised) {
					expect(roles.has(n.userId)).toBe(true);
					if (n.trigger === "budget_threshold" || n.trigger === "loan_due")
						expect(roles.get(n.userId)).not.toBe("viewer");
				}
				// A Viewer hears about a rule only as its maker, never as a follower.
				for (const n of raised)
					if (
						(n.trigger === "recurring_due" || n.trigger === "auto_recorded") &&
						roles.get(n.userId) === "viewer"
					) {
						const { ruleId } = JSON.parse(n.payload) as { ruleId: string };
						expect(
							f.occurrences.some(
								(o) => o.ruleId === ruleId && o.createdBy === n.userId,
							),
						).toBe(true);
					}
				const keys = raised.map((n) => `${n.userId} ${n.dedupeKey}`);
				expect(new Set(keys).size).toBe(keys.length);
			}),
		);
	});

	it("writes payloads the inbox and push read back, names and all", () => {
		fc.assert(
			fc.property(nearToday, (f) => {
				for (const n of scheduledNotifications(f)) {
					const read = readEventPayload(n.trigger, n.payload);
					expect(read).toEqual({
						trigger: n.trigger,
						...JSON.parse(n.payload),
					});
					expect(read?.householdName).toBe(f.householdName);
				}
			}),
		);
	});
});

describe("loanDueWhen", () => {
	it("mentions a Loan 3 days before, on the day, and every 7 days while it's overdue", () => {
		fc.assert(
			fc.property(fc.integer({ min: -400, max: 400 }), (ahead) => {
				const today = "2026-11-10";
				const dueOn = new Date(Date.parse(today) + ahead * 86_400_000)
					.toISOString()
					.slice(0, 10);
				const expected =
					ahead === 3
						? "soon"
						: ahead === 0
							? "today"
							: ahead < 0 && -ahead % 7 === 0
								? "overdue"
								: null;
				expect(loanDueWhen(dueOn, today)).toBe(expected);
			}),
		);
	});
});

describe("raiseScheduledNotifications", () => {
	// A fake database: raising keeps one per User and dedupe key, as the unique index does.
	const fakeDatabase = (facts: HouseholdFacts[]) => {
		const stored = new Map<string, RaisedNotification>();
		const adapters: RaiseAdapters = {
			facts: async () => facts,
			raise: async (notifications) => {
				let added = 0;
				for (const n of notifications) {
					const key = `${n.userId} ${n.dedupeKey}`;
					if (!stored.has(key)) {
						stored.set(key, n);
						added += 1;
					}
				}
				return added;
			},
		};
		return { adapters, stored };
	};

	it("raises each once, however often it runs within the hour", async () => {
		const { adapters, stored } = fakeDatabase([
			household({ occurrences: [occurrence()] }),
			household({
				householdId: "h2",
				budgets: [
					{
						categoryId: "c1",
						categoryName: "Fuel",
						month: "2026-11",
						level: 100,
					},
				],
			}),
		]);
		const at = new Date("2026-11-10T04:02:00Z");
		expect(await raiseScheduledNotifications(adapters, at)).toBe(3);
		expect(await raiseScheduledNotifications(adapters, at)).toBe(0);
		expect([...stored.values()].map((n) => n.trigger).toSorted()).toEqual([
			"budget_threshold",
			"budget_threshold",
			"recurring_due",
		]);
	});

	it("asks the database for nothing more when no household is at its 09:00", async () => {
		const { adapters } = fakeDatabase([]);
		expect(await raiseScheduledNotifications(adapters, new Date())).toBe(0);
	});
});

describe("event push text", () => {
	it("names a Recurring rule by its Category, never by its description, which may hold a figure", () => {
		const [due] = scheduledNotifications(
			household({ occurrences: [occurrence({ ruleName: "Rent 45,000" })] }),
		);
		expect(due && pushMessage(due.trigger, due.payload)).toEqual({
			title: "Recurring due",
			body: "Housing is due in Family.",
		});
		expect(due && readEventPayload(due.trigger, due.payload)).toEqual(
			expect.objectContaining({ ruleName: "Rent 45,000" }),
		);
	});

	it("says what's due in names only, the same whatever else the payload holds", () => {
		fc.assert(
			fc.property(
				fc.oneof(
					fc.record({
						trigger: fc.constant("recurring_due" as const),
						payload: fc.record({
							ruleId: fc.uuid(),
							ruleName: fc.string(),
							categoryName: fc.string(),
							dueOn: fc.constant("2026-11-10"),
							reminder: fc.boolean(),
						}),
					}),
					fc.record({
						trigger: fc.constant("auto_recorded" as const),
						payload: fc.record({
							ruleId: fc.uuid(),
							ruleName: fc.string(),
							categoryName: fc.string(),
							dueOn: fc.constant("2026-11-10"),
						}),
					}),
					fc.record({
						trigger: fc.constant("budget_threshold" as const),
						payload: fc.record({
							categoryId: fc.uuid(),
							categoryName: fc.string(),
							month: fc.constant("2026-11"),
							level: fc.constantFrom(80, 100),
						}),
					}),
					fc.record({
						trigger: fc.constant("loan_due" as const),
						payload: fc.record({
							loanId: fc.uuid(),
							contactName: fc.string(),
							direction: fc.constantFrom("lent", "borrowed"),
							dueOn: fc.constant("2026-11-10"),
							when: fc.constantFrom("soon", "today", "overdue"),
						}),
					}),
				),
				fc.string(),
				fc.dictionary(
					fc.constantFrom(
						"amount",
						"spent",
						"budget",
						"outstanding",
						"total",
						"used",
					),
					fc.oneof(
						fc.double({ noNaN: true }),
						fc.stringMatching(/^-?\d{1,9}(\.\d{1,4})?$/),
					),
				),
				({ trigger, payload }, householdName, money) => {
					const names = { householdName, ...payload };
					const plain = pushMessage(trigger, JSON.stringify(names));
					expect(
						pushMessage(trigger, JSON.stringify({ ...money, ...names })),
					).toEqual(plain);
					const said = `${plain.title} ${plain.body}`;
					expect(said).toContain(householdName);
					const named = Object.values(names)
						.filter((v): v is string => typeof v === "string")
						.join(" ");
					if (!/\d/.test(named)) expect(said).not.toMatch(/\d/);
				},
			),
		);
	});
});
