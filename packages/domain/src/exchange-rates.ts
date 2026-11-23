// Daily exchange rates (spec §3.4, §5; #44): Open Exchange Rates' free plan (USD base, 1,000 requests a month) fetched
// on the server, each date once, into `exchange_rates`. The `fetch-exchange-rates` Edge Function runs this behind
// adapters (ADR-0010); pg_cron calls it when today's rates are due or a device has asked for a past date.
// No imports: the Edge Function loads this file in Deno.

/** Of OXR's 1,000 requests a month, the most this ever spends, leaving room for fetching by hand. */
export const MONTHLY_FETCHES = 900;
/** How long a failed date waits before it's tried again, and how many tries it gets in all. */
export const RETRY_AFTER_MS = 60 * 60_000;
export const MAX_TRIES = 5;
/** Today's rates are fetched from 01:00 UTC, when OXR's latest is already today's. */
export const TODAY_FROM_HOUR_UTC = 1;
/** The most dates one run fetches. */
export const FETCHES_PER_RUN = 10;

/** What the server holds, as `exchange_rate_facts()` reports it. */
export type RateFacts = {
	todayHeld: boolean;
	todayLastAttemptAt: string | null;
	todayAttempts: number;
	/** Past dates devices asked for, oldest request first. */
	requested: { date: string; lastAttemptAt: string | null; attempts: number }[];
	fetchesThisMonth: number;
};

/** The UTC date of a moment, as YYYY-MM-DD. */
export const utcDate = (at: Date) => at.toISOString().slice(0, 10);

/** Whether a date may be tried now: it has tries left, and its last one was over an hour ago. */
const triable = (lastAttemptAt: string | null, attempts: number, now: Date) =>
	attempts < MAX_TRIES &&
	(lastAttemptAt === null ||
		now.getTime() - Date.parse(lastAttemptAt) >= RETRY_AFTER_MS);

/**
 * The dates to fetch now: today first once it's due, then the dates asked for, oldest request first. None tried in the
 * last hour or {@link MAX_TRIES} times already (a date OXR keeps refusing can't spend the quota), never more than a
 * run's worth, and never past the month's quota.
 */
export const pickRateDates = (facts: RateFacts, now: Date): string[] => {
	const today = utcDate(now);
	const due = [
		...(!facts.todayHeld &&
		now.getUTCHours() >= TODAY_FROM_HOUR_UTC &&
		triable(facts.todayLastAttemptAt, facts.todayAttempts, now)
			? [today]
			: []),
		...facts.requested
			.filter(
				(r) => r.date < today && triable(r.lastAttemptAt, r.attempts, now),
			)
			.map((r) => r.date),
	];
	const left = Math.max(0, MONTHLY_FETCHES - facts.fetchesThisMonth);
	return [...new Set(due)].slice(0, Math.min(left, FETCHES_PER_RUN));
};

const RATE_TEXT = /^\d+(\.\d+)?(e[+-]?\d+)?$/i;
const CURRENCY_CODE = /^[A-Z]{3}$/;

/**
 * An OXR response's rates, per USD, each exactly as OXR wrote it (the JSON source text, never through a float). Codes
 * that aren't ISO-shaped and rates that aren't positive are left out; anything that isn't a USD-based response throws.
 */
export const readOxrRates = (body: string): Record<string, string> => {
	// Numbers come out boxed with their source text, so a quoted "3" is never taken for a rate.
	const numbers = new WeakSet<object>();
	const parsed = JSON.parse(
		body,
		(_key, value, context?: { source?: string }) => {
			if (typeof value !== "number") return value;
			// Without the source text the rate would go through a float: refuse rather than store a rounded one.
			if (context?.source === undefined)
				throw new Error("JSON.parse gives no source text on this runtime");
			const box = { text: context.source };
			numbers.add(box);
			return box;
		},
	) as { base?: unknown; rates?: unknown };
	if (
		parsed.base !== "USD" ||
		typeof parsed.rates !== "object" ||
		parsed.rates === null
	)
		throw new Error("Not an Open Exchange Rates response in USD");
	return Object.fromEntries(
		Object.entries(parsed.rates as Record<string, unknown>).flatMap(
			([code, rate]) => {
				if (
					!CURRENCY_CODE.test(code) ||
					typeof rate !== "object" ||
					rate === null ||
					!numbers.has(rate)
				)
					return [];
				const { text } = rate as { text: string };
				return RATE_TEXT.test(text) && /[1-9]/.test(text.split(/e/i)[0] ?? "")
					? [[code, text]]
					: [];
			},
		),
	);
};

/** What a run needs, as the service role and with the OXR key. */
export type RateAdapters = {
	facts: () => Promise<RateFacts>;
	/** Counted before the fetch, so a failing one waits and still uses the quota. */
	recordFetch: (date: string) => Promise<void>;
	/** OXR's response body: `latest` for today, `historical/<date>` for a past date. */
	fetchRates: (date: string, latest: boolean) => Promise<string>;
	store: (date: string, rates: Record<string, string>) => Promise<void>;
};

/**
 * Fetches and stores what's due; a failed date is reported and left for its retry, never stopping the others. Every
 * date is recorded before any is fetched, so a run that overlaps this one sees them as just tried.
 */
export const fetchExchangeRates = async (adapters: RateAdapters, now: Date) => {
	const today = utcDate(now);
	const fetched: string[] = [];
	const failed: { date: string; reason: string }[] = [];
	const due = pickRateDates(await adapters.facts(), now);
	for (const date of due) await adapters.recordFetch(date);
	for (const date of due) {
		try {
			const rates = readOxrRates(
				await adapters.fetchRates(date, date === today),
			);
			// Storing nothing would mark the date's ask fulfilled with no rate to show for it.
			if (Object.keys(rates).length === 0)
				throw new Error("OXR gave no usable rates");
			await adapters.store(date, rates);
			fetched.push(date);
		} catch (error) {
			failed.push({
				date,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return { fetched, failed };
};
