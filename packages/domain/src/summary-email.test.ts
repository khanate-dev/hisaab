import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	type EmailMessage,
	emailAmount,
	EMAIL_GAP_MS,
	emailOutcome,
	pacedEmails,
	sendSummaryEmail,
	type SummaryFigures,
	summaryEmail,
} from "./summary-email";

const figures = (more: Partial<SummaryFigures> = {}): SummaryFigures => ({
	householdName: "Family",
	month: "2026-10",
	first: "2026-10-01",
	last: "2026-10-31",
	currency: "PKR",
	decimals: 2,
	income: "150000",
	expense: "98765.5",
	net: "51234.5",
	categories: [
		{ name: "Food", amount: "40000" },
		{ name: "Rent", amount: "35000.25" },
	],
	...more,
});

describe("emailAmount", () => {
	it("writes any decimal out exactly, in its currency's minor units, grouped in thousands", () => {
		fc.assert(
			fc.property(
				fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n }),
				fc.constantFrom(0, 2, 3),
				(minor, decimals) => {
					const scale = 10n ** BigInt(decimals);
					const negative = minor < 0n;
					const size = negative ? -minor : minor;
					const whole = (size / scale).toString();
					const fraction = (size % scale).toString().padStart(decimals, "0");
					const text = `${negative ? "-" : ""}${whole}${decimals > 0 ? `.${fraction}` : ""}`;
					const shown = emailAmount(text, "PKR", decimals);
					const back = shown.replace("PKR ", "").replaceAll(",", "");
					expect(back).toBe(minor === 0n ? text.replace("-", "") : text);
				},
			),
		);
	});

	it("pads what Postgres trims", () => {
		expect(emailAmount("98765.5", "PKR", 2)).toBe("PKR 98,765.50");
		expect(emailAmount("-30", "KWD", 3)).toBe("-KWD 30.000");
		expect(emailAmount("1200", "JPY", 0)).toBe("JPY 1,200");
	});
});

describe("summaryEmail", () => {
	it("says how the month went, and what it spent most on", () => {
		const email = summaryEmail(figures());
		expect(email.subject).toBe("October 2026 in Family");
		expect(email.text).toContain("Came in: PKR 150,000.00");
		expect(email.text).toContain("Went out: PKR 98,765.50");
		expect(email.text).toContain("Left over: PKR 51,234.50");
		expect(email.text).toContain("- Rent: PKR 35,000.25");
	});

	it("never lets a name into the HTML as markup", () => {
		const email = summaryEmail(
			figures({
				householdName: "<b>Us</b>",
				categories: [{ name: "Tea & <script>", amount: "1" }],
			}),
		);
		expect(email.html).not.toContain("<script>");
		expect(email.html).toContain("Tea &amp; &lt;script&gt;");
		expect(email.html).toContain("&lt;b&gt;Us&lt;/b&gt;");
	});
});

describe("sendSummaryEmail", () => {
	const send = (status: number, found = true) => {
		const sent: EmailMessage[] = [];
		const keys: string[] = [];
		const outcome = sendSummaryEmail(
			{
				figures: async () => (found ? figures() : null),
				send: async (message, key) => {
					sent.push(message);
					keys.push(key);
					return status >= 400 ? { status, error: "nope" } : { status };
				},
			},
			{ id: "d1", notificationId: "n1", target: "ayesha@example.com" },
		);
		return { outcome, sent, keys };
	};

	it("sends the summary to its address, keyed by its delivery so a retry never sends it twice", async () => {
		const { outcome, sent, keys } = send(200);
		await outcome;
		expect(keys).toEqual(["monthly-summary/d1"]);
		expect(send(200).keys).toEqual([]);
		expect(await outcome).toEqual({ status: "sent" });
		expect(sent.map((m) => [m.to, m.subject])).toEqual([
			["ayesha@example.com", "October 2026 in Family"],
		]);
	});

	it("retries what the provider couldn't take yet, and gives up on what it refused", async () => {
		expect((await send(429).outcome).status).toBe("failed");
		expect((await send(503).outcome).status).toBe("failed");
		expect((await send(422).outcome).status).toBe("dead");
	});

	it("sends nothing when there are no figures", async () => {
		const { outcome, sent } = send(200, false);
		expect((await outcome).status).toBe("dead");
		expect(sent).toEqual([]);
	});

	it("reads a provider's answer by its status", () => {
		expect(emailOutcome(202)).toEqual({ status: "sent" });
	});
});

describe("pacedEmails", () => {
	it("sends one at a time with a gap between, and a throw fails only its own", async () => {
		const events: string[] = [];
		const sender = pacedEmails(
			async (d: string) => {
				events.push(`send ${d}`);
				if (d === "b") throw new Error("down");
				return { status: "sent" as const };
			},
			async (ms) => {
				events.push(`wait ${ms}`);
			},
		);
		const outcomes = await sender.send(["a", "b", "c"]);
		expect(events).toEqual([
			"send a",
			`wait ${EMAIL_GAP_MS}`,
			"send b",
			`wait ${EMAIL_GAP_MS}`,
			"send c",
		]);
		expect(outcomes.map((o) => o.status)).toEqual(["sent", "failed", "sent"]);
	});
});
