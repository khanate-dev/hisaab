// The Monthly summary's email (spec §3.5, §6.2; #63): what `dispatch-notifications` sends through Resend from
// `mail.hisaab.khanate.pk` to whoever opted in. The figures come from the database at send time
// (`monthly_summary_figures`, exact in numeric, as decimal text); this writes them out and sends behind adapters
// (ADR-0010), so it's tested without a network. Email is the only channel that carries amounts.
// No imports: the dispatch-notifications Edge Function loads this file in Deno.

/** A Budget month's figures, as `monthly_summary_figures` reads them: amounts as decimal text in the Base currency. */
export type SummaryFigures = {
	householdName: string;
	/** YYYY-MM. */
	month: string;
	/** Its first and last days, YYYY-MM-DD. */
	first: string;
	last: string;
	currency: string;
	/** The currency's minor units. */
	decimals: number;
	income: string;
	expense: string;
	net: string;
	/** The top-level Categories it spent most on, most first (up to five). */
	categories: { name: string; amount: string }[];
};

const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * An amount as the email shows it, from its decimal text alone (never a float): "PKR 1,234,567.50", "-PKR 30.00".
 * Text that isn't a decimal is shown as it came.
 */
export const emailAmount = (
	amount: string,
	currency: string,
	decimals: number,
) => {
	const match = DECIMAL.exec(amount);
	if (!match) return `${currency} ${amount}`;
	const [, sign, whole = "0", fraction = ""] = match;
	const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	const minor = fraction.padEnd(decimals, "0");
	const negative = sign === "-" && /[1-9]/.test(whole + fraction);
	return `${negative ? "-" : ""}${currency} ${grouped}${minor === "" ? "" : `.${minor}`}`;
};

const escapeHtml = (text: string) =>
	text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");

/** The email: a subject, and the same summary as plain text and as simple HTML. English only at launch, as push. */
export const summaryEmail = (figures: SummaryFigures) => {
	const named = `${MONTHS[Number(figures.month.slice(5, 7)) - 1] ?? figures.month} ${figures.month.slice(0, 4)}`;
	const money = (amount: string) =>
		emailAmount(amount, figures.currency, figures.decimals);
	const where = figures.householdName;
	const rows: [string, string][] = [
		["Came in", money(figures.income)],
		["Went out", money(figures.expense)],
		["Left over", money(figures.net)],
	];
	const spent = figures.categories.map((c): [string, string] => [
		c.name,
		money(c.amount),
	]);
	const span = `${figures.first} to ${figures.last}`;
	const text = [
		`How ${named} went in ${where} (${span}).`,
		"",
		...rows.map(([label, value]) => `${label}: ${value}`),
		...(spent.length > 0
			? [
					"",
					"Spent most on:",
					...spent.map(([name, value]) => `- ${name}: ${value}`),
				]
			: []),
		"",
		"Open Hisaab for the full reports. You get this email because you turned it on in Notification preferences.",
	].join("\n");
	const table = (pairs: [string, string][]) =>
		`<table>${pairs
			.map(
				([label, value]) =>
					`<tr><td>${escapeHtml(label)}</td><td style="text-align:right">${escapeHtml(value)}</td></tr>`,
			)
			.join("")}</table>`;
	const html = [
		`<p>How ${escapeHtml(named)} went in <strong>${escapeHtml(where)}</strong> (${escapeHtml(span)}).</p>`,
		table(rows),
		...(spent.length > 0 ? ["<p>Spent most on:</p>", table(spent)] : []),
		"<p>Open Hisaab for the full reports. You get this email because you turned it on in Notification preferences.</p>",
	].join("\n");
	return { subject: `${named} in ${where}`, text, html };
};

/** An email as Resend takes it. */
export type EmailMessage = {
	to: string;
	subject: string;
	text: string;
	html: string;
};

/** How a send went, as the outbox records it (as `SendOutcome` in ./notifications). */
type Outcome =
	| { status: "sent" }
	| { status: "failed"; error: string }
	| { status: "dead"; error: string };

/**
 * What an email provider's answer means: 2xx sent; 429 and 5xx failed, to retry; any other 4xx dead, as the same
 * email would be refused again.
 */
export const emailOutcome = (status: number, error = ""): Outcome => {
	if (status >= 200 && status < 300) return { status: "sent" };
	if (status === 429 || status >= 500)
		return {
			status: "failed",
			error: `Email answered ${status} ${error}`.trim(),
		};
	return { status: "dead", error: `Email answered ${status} ${error}`.trim() };
};

/** What sending a summary needs: its figures from the database, and a way to send an email. */
export type EmailAdapters = {
	/** Null when there are none: not a summary, or the household has no Base currency yet. */
	figures: (notificationId: string) => Promise<SummaryFigures | null>;
	/** Answers with the provider's HTTP status, and its error text when it refused. */
	send: (message: EmailMessage) => Promise<{ status: number; error?: string }>;
};

/** Sends one Monthly summary email delivery: dead when there's nothing to say, else as the provider answered. */
export const sendSummaryEmail = async (
	adapters: EmailAdapters,
	delivery: { notificationId: string; target: string },
): Promise<Outcome> => {
	const figures = await adapters.figures(delivery.notificationId);
	if (figures === null)
		return { status: "dead", error: "No Monthly summary figures for it" };
	const { status, error } = await adapters.send({
		to: delivery.target,
		...summaryEmail(figures),
	});
	return emailOutcome(status, error);
};
