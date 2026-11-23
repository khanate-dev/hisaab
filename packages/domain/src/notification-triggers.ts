// Event notifications (spec §3.5; issue #9's table; #62, #63): Recurring due, Auto-recorded, Budget threshold, Loan due
// and the Monthly summary, decided once a day at 09:00 household time, and the Household activity digest at 20:00,
// from what the database gathers (`notification_facts`, `summary_facts`, `digest_facts`), then raised once each by
// their dedupe key (`raise_notifications`). The payloads carry names and counts only, never an amount, as push text is
// made from them (`pushMessage`), and the inbox reads them (`readEventPayload`, in ./notifications).
// No imports: the raise-notifications Edge Function loads this file in Deno.

type Role = "admin" | "member" | "viewer";

/** One household at its 09:00, as `notification_facts` gathers it. */
export type HouseholdFacts = {
	householdId: string;
	householdName: string;
	/** Its own today, YYYY-MM-DD. */
	today: string;
	members: { userId: string; role: Role }[];
	/** Its Recurring rules' Occurrences due in the last 3 days, today's included, or whose snooze ends today. */
	occurrences: {
		ruleId: string;
		mode: "confirm" | "auto";
		createdBy: string;
		/** Its description, else its Category's name: free text, for the inbox only (it may hold a figure). */
		ruleName: string;
		/** Its Category's name, which push names it by. */
		categoryName: string;
		dueOn: string;
		state: "pending" | "confirmed" | "skipped" | "snoozed";
		snoozedUntil: string | null;
		/** Admins and Members who turned "Notify me" on for its rule (#105). */
		followers: string[];
	}[];
	/** Its Loans still owed and not written off, due within 3 days or overdue. */
	loans: {
		loanId: string;
		contactName: string;
		direction: "lent" | "borrowed";
		dueOn: string;
	}[];
	/** Its expense Budgets this Budget month that are 80% or 100% used. */
	budgets: {
		categoryId: string;
		categoryName: string;
		month: string;
		level: 80 | 100;
	}[];
};

export type EventTrigger =
	| "recurring_due"
	| "auto_recorded"
	| "budget_threshold"
	| "loan_due"
	| "household_activity"
	| "monthly_summary";

/** One household at its 20:00 (#63), as `digest_facts` gathers it. */
export type DigestFacts = {
	householdId: string;
	householdName: string;
	/** Its own today, YYYY-MM-DD. */
	today: string;
	/** Who turned the Household activity digest on there (it's off by default). */
	optedIn: string[];
	/** Who changed something over the day before, and how many times (changes made together once). */
	changes: { actorId: string; actorName: string; count: number }[];
};

/** One household at 09:00 on a Budget month's first day (#63), as `summary_facts` gathers it. */
export type SummaryFacts = {
	householdId: string;
	householdName: string;
	/** The Budget month just gone, YYYY-MM. */
	month: string;
	/** Everyone in it, Viewers included. */
	members: string[];
};

/** A Notification to raise: to one User, once only by its dedupe key. */
export type RaisedNotification = {
	householdId: string;
	userId: string;
	trigger: EventTrigger;
	/** JSON text, names only. */
	payload: string;
	dedupeKey: string;
};

/** When a Loan is due, as its Notification says: in 3 days, today, or overdue (weekly while it is). */
export type LoanDueWhen = "soon" | "today" | "overdue";

const DAY = 86_400_000;
const daysBetween = (from: string, to: string) =>
	Math.round((Date.parse(to) - Date.parse(from)) / DAY);
const shift = (date: string, days: number) =>
	new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);

/** Whether a Loan due on `dueOn` is mentioned today: 3 days before, on the day, and every 7 days while overdue. */
export const loanDueWhen = (
	dueOn: string,
	today: string,
): LoanDueWhen | null => {
	const ahead = daysBetween(today, dueOn);
	if (ahead === 3) return "soon";
	if (ahead === 0) return "today";
	if (ahead < 0 && -ahead % 7 === 0) return "overdue";
	return null;
};

/**
 * What a household raises at its 09:00 (issue #9's table):
 * - Recurring due: a Confirm-mode Occurrence that's Pending on its due date, and again if still Pending 3 days on, to
 *   the rule's maker and its followers;
 * - Auto-recorded: an Auto-record rule's Occurrence recorded today, to the rule's maker and its followers;
 * - Budget threshold: a Budget that's passed 80%, then 100%, once each a Budget month, to its Admins and Members;
 * - Loan due: 3 days before, on the day and weekly while overdue, to its Admins and Members.
 * Only to someone in the household (a Personal household's only Member is its owner).
 */
export const scheduledNotifications = (
	facts: HouseholdFacts,
): RaisedNotification[] => {
	const { householdId, householdName, today } = facts;
	const inHousehold = new Set(facts.members.map((m) => m.userId));
	const writers = facts.members
		.filter((m) => m.role !== "viewer")
		.map((m) => m.userId);
	const raised: RaisedNotification[] = [];
	const raise = (
		userIds: readonly string[],
		trigger: EventTrigger,
		dedupeKey: string,
		payload: Record<string, unknown>,
	) => {
		for (const userId of userIds)
			if (inHousehold.has(userId))
				raised.push({
					householdId,
					userId,
					trigger,
					payload: JSON.stringify({ householdName, ...payload }),
					dedupeKey,
				});
	};
	const reminderDay = shift(today, -3);
	for (const o of facts.occurrences) {
		// The rule's maker, and whoever follows it.
		const hearers = [
			...new Set([
				o.createdBy,
				// Following is for those who write there; a Viewer since isn't told (issue #9).
				...o.followers.filter((f) => writers.includes(f)),
			]),
		];
		const about = {
			ruleId: o.ruleId,
			ruleName: o.ruleName,
			categoryName: o.categoryName,
			dueOn: o.dueOn,
		};
		if (o.mode === "confirm" && o.state === "pending") {
			// Back from a snooze today: Pending again, so due again.
			if (o.snoozedUntil === today)
				raise(
					hearers,
					"recurring_due",
					`recurring_due/${o.ruleId}/${o.dueOn}/snooze/${today}`,
					{ ...about, reminder: false },
				);
			else if (o.dueOn === today)
				raise(
					hearers,
					"recurring_due",
					`recurring_due/${o.ruleId}/${o.dueOn}`,
					{
						...about,
						reminder: false,
					},
				);
			else if (o.dueOn === reminderDay)
				raise(
					hearers,
					"recurring_due",
					`recurring_due/${o.ruleId}/${o.dueOn}/reminder`,
					{ ...about, reminder: true },
				);
		}
		if (o.mode === "auto" && o.state === "confirmed" && o.dueOn === today)
			raise(
				hearers,
				"auto_recorded",
				`auto_recorded/${o.ruleId}/${o.dueOn}`,
				about,
			);
	}
	for (const b of facts.budgets)
		raise(
			writers,
			"budget_threshold",
			`budget_threshold/${b.categoryId}/${b.month}/${b.level}`,
			{
				categoryId: b.categoryId,
				categoryName: b.categoryName,
				month: b.month,
				level: b.level,
			},
		);
	for (const l of facts.loans) {
		const when = loanDueWhen(l.dueOn, today);
		if (when)
			raise(writers, "loan_due", `loan_due/${l.loanId}/${today}`, {
				loanId: l.loanId,
				contactName: l.contactName,
				direction: l.direction,
				dueOn: l.dueOn,
				when,
			});
	}
	return raised;
};

/**
 * The Household activity digest (issue #9's table): at 20:00, to each Member who opted in, what the others changed
 * over the day, by whom; nothing when they changed nothing. Counts and names only.
 */
export const activityDigests = (facts: DigestFacts): RaisedNotification[] =>
	facts.optedIn.flatMap((userId) => {
		const others = facts.changes.filter(
			(c) => c.actorId !== userId && c.count > 0,
		);
		const changes = others.reduce((n, c) => n + c.count, 0);
		if (changes === 0) return [];
		return [
			{
				householdId: facts.householdId,
				userId,
				trigger: "household_activity" as const,
				payload: JSON.stringify({
					householdName: facts.householdName,
					date: facts.today,
					changes,
					// Most active first.
					people: others
						.toSorted(
							(a, b) =>
								b.count - a.count || a.actorName.localeCompare(b.actorName),
						)
						.map((c) => c.actorName),
				}),
				dedupeKey: `household_activity/${facts.householdId}/${facts.today}`,
			},
		];
	});

/** The Monthly summary (issue #9's table): at the start of each Budget month, about the one gone, to everyone. */
export const monthlySummaries = (facts: SummaryFacts): RaisedNotification[] =>
	facts.members.map((userId) => ({
		householdId: facts.householdId,
		userId,
		trigger: "monthly_summary" as const,
		payload: JSON.stringify({
			householdName: facts.householdName,
			month: facts.month,
		}),
		dedupeKey: `monthly_summary/${facts.householdId}/${facts.month}`,
	}));

/** What raising needs from the database, as the service role. */
export type RaiseAdapters = {
	/** Each household where it's 09:00 at `asOf`. */
	facts: (asOf: string) => Promise<HouseholdFacts[]>;
	/** Each household where it's 20:00 at `asOf`. */
	digestFacts: (asOf: string) => Promise<DigestFacts[]>;
	/** Each household at 09:00 on a Budget month's first day at `asOf`. */
	summaryFacts: (asOf: string) => Promise<SummaryFacts[]>;
	/** Raises them, each once only; answers with how many were new. */
	raise: (notifications: RaisedNotification[]) => Promise<number>;
};

/**
 * Raises what's due in every household: its events and Monthly summary at 09:00, its digest at 20:00. Answers with how
 * many were new.
 */
export const raiseScheduledNotifications = async (
	adapters: RaiseAdapters,
	asOf: Date,
) => {
	const at = asOf.toISOString();
	const [events, digests, summaries] = await Promise.all([
		adapters.facts(at),
		adapters.digestFacts(at),
		adapters.summaryFacts(at),
	]);
	const raised = [
		...events.flatMap(scheduledNotifications),
		...digests.flatMap(activityDigests),
		...summaries.flatMap(monthlySummaries),
	];
	return raised.length > 0 ? adapters.raise(raised) : 0;
};
