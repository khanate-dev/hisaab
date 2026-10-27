// Recurring rules (spec §3.3, ADR-0004): a template Expense or Income plus a schedule that produces Occurrences.
// Confirm (the default) leaves each due Occurrence Pending, affecting no Balance or Budget, until it's confirmed,
// skipped or snoozed; Auto-record makes it an Entry on its due date. An Occurrence is named by its rule and due date,
// and its id is derived from them, so two offline devices doing the same one write the same rows.

import { shiftCalendarDate } from "./dates";

export const RECURRING_MODES = ["confirm", "auto"] as const;
export type RecurringMode = (typeof RECURRING_MODES)[number];

export const RECURRING_FREQUENCIES = ["monthly", "weekly", "yearly"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export const OCCURRENCE_STATES = ["confirmed", "skipped", "snoozed"] as const;
export type OccurrenceState = (typeof OCCURRENCE_STATES)[number];

/** How often a rule falls due. Mirrors the `recurring_rules` schedule columns. */
export type Schedule = {
	frequency: RecurringFrequency;
	/** Every this many months, weeks or years; 1 or more. */
	interval: number;
	/** Monthly only: 1 to 31; a month shorter than that has it on its last day. */
	day_of_month: number | null;
	/** YYYY-MM-DD: the first possible due date; a weekly rule's weekday and a yearly rule's day come from it. */
	starts_on: string;
	/** YYYY-MM-DD, included; null for no end. */
	ends_on: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");

const daysInMonth = (year: number, month: number) =>
	new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The date in a month (1-based) on a day, or the month's last day when it's shorter. */
const dayIn = (year: number, month: number, day: number) =>
	`${year}-${pad(month)}-${pad(Math.min(day, daysInMonth(year, month)))}`;

/** The rule's nth due date counted from its start, before trimming to its start and end. */
const nthDate = (schedule: Schedule, n: number) => {
	const [year, month, day] = schedule.starts_on.split("-").map(Number) as [
		number,
		number,
		number,
	];
	switch (schedule.frequency) {
		case "weekly":
			return shiftCalendarDate(schedule.starts_on, 7 * schedule.interval * n);
		case "yearly":
			return dayIn(year + schedule.interval * n, month, day);
		case "monthly": {
			const index = year * 12 + (month - 1) + schedule.interval * n;
			return dayIn(
				Math.floor(index / 12),
				(index % 12) + 1,
				schedule.day_of_month ?? day,
			);
		}
	}
};

/**
 * Every due date of a rule from `from` to `to`, both included, oldest first: on or after its start, on or before its
 * end. A monthly rule's first due date is its day in the start's month, or the next round when that's before the start.
 */
export const dueDates = (schedule: Schedule, from: string, to: string) => {
	if (!Number.isInteger(schedule.interval) || schedule.interval < 1)
		throw new Error(`A schedule repeats every 1 or more: ${schedule.interval}`);
	const last =
		schedule.ends_on !== null && schedule.ends_on < to ? schedule.ends_on : to;
	const dates: string[] = [];
	for (let n = 0; ; n += 1) {
		const date = nthDate(schedule, n);
		if (date > last) break;
		if (date >= schedule.starts_on && date >= from) dates.push(date);
	}
	return dates;
};

/** A rule as Pending needs it: its id, schedule and mode. */
export type RuleLike = Schedule & { id: string; mode: RecurringMode };

/** What's been done with an Occurrence, as synced. */
export type OccurrenceRecord = {
	rule_id: string;
	due_on: string;
	state: OccurrenceState;
	snoozed_until: string | null;
};

export type DueOccurrence<R extends RuleLike> = { rule: R; dueOn: string };

/** An Occurrence's key on a device: its rule and due date, which its id is derived from. */
export const occurrenceKey = (ruleId: string, dueOn: string) =>
	`${ruleId}/${dueOn}`;

/** The keys of Occurrences nothing more is to be done with today: confirmed, skipped, or snoozed past today. */
const handledKeys = (records: readonly OccurrenceRecord[], today: string) => {
	const handled = new Set<string>();
	for (const record of records)
		if (
			record.state !== "snoozed" ||
			(record.snoozed_until !== null && record.snoozed_until > today)
		)
			handled.add(occurrenceKey(record.rule_id, record.due_on));
	return handled;
};

/**
 * Occurrences due by today that nothing has been done with yet, oldest first: never confirmed or skipped, and not
 * snoozed past today. Confirm rules' are Pending; Auto-record rules' are recorded by the first device to see them.
 */
export const dueOccurrences = <R extends RuleLike>(
	rules: readonly R[],
	records: readonly OccurrenceRecord[],
	today: string,
): DueOccurrence<R>[] => {
	const handled = handledKeys(records, today);
	return rules
		.flatMap((rule) =>
			dueDates(rule, rule.starts_on, today)
				.filter((dueOn) => !handled.has(occurrenceKey(rule.id, dueOn)))
				.map((dueOn) => ({ rule, dueOn })),
		)
		.toSorted(
			(a, b) =>
				a.dueOn.localeCompare(b.dueOn) || a.rule.id.localeCompare(b.rule.id),
		);
};

/**
 * How an edit to a rule reaches only Occurrences still to come (ADR-0004). A rule not yet started changes in place.
 * One already started ends yesterday, keeping its past Occurrences (and what was done with them, Pending ones
 * included) as they were, and the edited rule carries on as a new one from its first due date from today; none when
 * the edit leaves it nothing more to come.
 */
export const ruleEdit = (
	current: Schedule,
	edited: Schedule,
	today: string,
):
	| { split: false }
	| { split: true; endsOn: string; startsOn: string | null } => {
	if (current.starts_on >= today) return { split: false };
	const yesterday = shiftCalendarDate(today, -1);
	const endsOn =
		current.ends_on !== null && current.ends_on < yesterday
			? current.ends_on
			: yesterday;
	const startsOn =
		edited.starts_on >= today
			? edited.starts_on
			: nextDueDate(edited, yesterday);
	return { split: true, endsOn, startsOn };
};

/** The next due date after today, for showing on a rule; null once it has ended. */
export const nextDueDate = (schedule: Schedule, today: string) => {
	const from = shiftCalendarDate(today, 1);
	// A year covers every schedule's next date except a long interval's; two rounds of the longest cover it.
	const horizon = shiftCalendarDate(from, 366 * 2 * schedule.interval);
	return dueDates(schedule, from, horizon)[0] ?? null;
};

// SHA-1 (FIPS 180-4), for RFC 9562 name-based UUIDs (version 5). Not used for anything secret.
const sha1 = (message: readonly number[]) => {
	const bytes = [...message];
	const bitLength = bytes.length * 8;
	bytes.push(0x80);
	while (bytes.length % 64 !== 56) bytes.push(0);
	for (let i = 7; i >= 0; i -= 1)
		bytes.push(i > 3 ? 0 : (bitLength >>> (i * 8)) & 0xff);
	const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
	const w = new Array<number>(80);
	const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));
	for (let chunk = 0; chunk < bytes.length; chunk += 64) {
		for (let i = 0; i < 16; i += 1) {
			const at = chunk + i * 4;
			w[i] =
				((bytes[at] ?? 0) << 24) |
				((bytes[at + 1] ?? 0) << 16) |
				((bytes[at + 2] ?? 0) << 8) |
				(bytes[at + 3] ?? 0);
		}
		for (let i = 16; i < 80; i += 1)
			w[i] = rotl(
				(w[i - 3] ?? 0) ^ (w[i - 8] ?? 0) ^ (w[i - 14] ?? 0) ^ (w[i - 16] ?? 0),
				1,
			);
		let [a, b, c, d, e] = h as [number, number, number, number, number];
		for (let i = 0; i < 80; i += 1) {
			const [f, k] =
				i < 20
					? [(b & c) | (~b & d), 0x5a827999]
					: i < 40
						? [b ^ c ^ d, 0x6ed9eba1]
						: i < 60
							? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc]
							: [b ^ c ^ d, 0xca62c1d6];
			const next = (rotl(a, 5) + f + e + k + (w[i] ?? 0)) | 0;
			e = d;
			d = c;
			c = rotl(b, 30);
			b = a;
			a = next;
		}
		h[0] = ((h[0] ?? 0) + a) | 0;
		h[1] = ((h[1] ?? 0) + b) | 0;
		h[2] = ((h[2] ?? 0) + c) | 0;
		h[3] = ((h[3] ?? 0) + d) | 0;
		h[4] = ((h[4] ?? 0) + e) | 0;
	}
	return h.flatMap((word) => [24, 16, 8, 0].map((s) => (word >>> s) & 0xff));
};

const hex = (byte: number) => byte.toString(16).padStart(2, "0");

/** An RFC 9562 version-5 UUID: the same namespace and name always give the same id. */
export const nameBasedUuid = (namespace: string, name: string) => {
	const nsHex = namespace.replaceAll("-", "");
	const message = Array.from({ length: 16 }, (_, i) =>
		Number.parseInt(nsHex.slice(i * 2, i * 2 + 2), 16),
	);
	for (let i = 0; i < name.length; i += 1) {
		const code = name.charCodeAt(i);
		// Names here are ids and dates; anything else would need UTF-8 encoding first.
		if (code > 0x7f) throw new Error("name-based ids here take ASCII names");
		message.push(code);
	}
	const bytes = sha1(message).slice(0, 16);
	bytes[6] = 0x50 | ((bytes[6] ?? 0) & 0x0f);
	bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
	const text = bytes.map(hex).join("");
	return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
};

/** Hisaab's namespace for Occurrence ids; fixed forever, as every device must derive the same ones. */
const OCCURRENCE_NAMESPACE = "6f0f4c8e-3a5b-4c1d-9e2f-7a8b9c0d1e2f";

/** An Occurrence's id, from its rule and due date (ADR-0004). */
export const occurrenceId = (ruleId: string, dueOn: string) =>
	nameBasedUuid(OCCURRENCE_NAMESPACE, `occurrence/${ruleId}/${dueOn}`);

/** The id of the Entry an Occurrence becomes, so two devices confirming it write the same Entry. */
export const occurrenceEntryId = (ruleId: string, dueOn: string) =>
	nameBasedUuid(OCCURRENCE_NAMESPACE, `entry/${ruleId}/${dueOn}`);
