// Event notifications (spec §3.5; issue #9's table; #62): Recurring due, Auto-recorded, Budget threshold and Loan due,
// decided once a day at 09:00 household time from what the database gathers (`notification_facts`), then raised once
// each by their dedupe key (`raise_notifications`). The payloads carry names only, never an amount, as push text is
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
	/** Its Recurring rules' Occurrences due in the last 3 days, today's included. */
	occurrences: {
		ruleId: string;
		mode: "confirm" | "auto";
		createdBy: string;
		/** Its description, else its Category's name. */
		ruleName: string;
		dueOn: string;
		state: "pending" | "confirmed" | "skipped" | "snoozed";
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
	"recurring_due" | "auto_recorded" | "budget_threshold" | "loan_due";

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
 *   the rule's maker;
 * - Auto-recorded: an Auto-record rule's Occurrence recorded today, to the rule's maker;
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
		const about = { ruleId: o.ruleId, ruleName: o.ruleName, dueOn: o.dueOn };
		if (o.mode === "confirm" && o.state === "pending") {
			if (o.dueOn === today)
				raise(
					[o.createdBy],
					"recurring_due",
					`recurring_due/${o.ruleId}/${o.dueOn}`,
					{
						...about,
						reminder: false,
					},
				);
			else if (o.dueOn === reminderDay)
				raise(
					[o.createdBy],
					"recurring_due",
					`recurring_due/${o.ruleId}/${o.dueOn}/reminder`,
					{ ...about, reminder: true },
				);
		}
		if (o.mode === "auto" && o.state === "confirmed" && o.dueOn === today)
			raise(
				[o.createdBy],
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

/** What raising needs from the database, as the service role. */
export type RaiseAdapters = {
	/** Each household where it's 09:00 at `asOf`. */
	facts: (asOf: string) => Promise<HouseholdFacts[]>;
	/** Raises them, each once only; answers with how many were new. */
	raise: (notifications: RaisedNotification[]) => Promise<number>;
};

/** Raises what's due in every household at its 09:00. Answers with how many were new. */
export const raiseScheduledNotifications = async (
	adapters: RaiseAdapters,
	asOf: Date,
) => {
	const raised = (await adapters.facts(asOf.toISOString())).flatMap(
		scheduledNotifications,
	);
	return raised.length > 0 ? adapters.raise(raised) : 0;
};
