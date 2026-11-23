// Daily exchange rates (spec §3.4, #44): fetches what's due from Open Exchange Rates into `exchange_rates` (pg_cron
// calls this with the service role's key). The logic is in packages/domain behind adapters (ADR-0010); this wires them
// to PostgREST and OXR.
import {
	fetchExchangeRates,
	type RateAdapters,
	type RateFacts,
} from "../../../packages/domain/src/exchange-rates.ts";
import { Forbidden, refused, serviceOnly } from "../_shared/service-only.ts";

const url = Deno.env.get("SUPABASE_URL");
if (!url) throw new Error("SUPABASE_URL must be set");
// Unset, every fetch fails (and waits its hour) rather than the function failing to boot.
const appId = Deno.env.get("OXR_APP_ID") ?? "";
const oxr = Deno.env.get("OXR_URL") ?? "https://openexchangerates.org/api";

const adaptersFor = (key: string): RateAdapters => {
	const rpc = async (name: string, args: unknown) => {
		const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
			method: "POST",
			headers: {
				apikey: key,
				Authorization: `Bearer ${key}`,
				"content-type": "application/json",
			},
			body: JSON.stringify(args),
		});
		if (refused(response.status)) throw new Forbidden();
		if (!response.ok)
			throw new Error(
				`PostgREST rpc/${name} answered ${response.status}: ${await response.text()}`,
			);
		// A function returning void answers 204, with no body.
		const body = await response.text();
		return body ? (JSON.parse(body) as unknown) : null;
	};
	return {
		facts: async () => (await rpc("exchange_rate_facts", {})) as RateFacts,
		recordFetch: async (date) => {
			await rpc("record_exchange_rate_fetch", { on_date: date });
		},
		fetchRates: async (date, latest) => {
			if (!appId) throw new Error("OXR_APP_ID is not set");
			const path = latest ? "latest.json" : `historical/${date}.json`;
			// The key goes in a header, so it never shows in a URL or a log line.
			const response = await fetch(`${oxr}/${path}`, {
				headers: { Authorization: `Token ${appId}` },
			});
			if (!response.ok)
				throw new Error(`OXR ${path} answered ${response.status}`);
			return response.text();
		},
		store: async (date, rates) =>
			(await rpc("store_exchange_rates", {
				on_date: date,
				rates,
			})) as number,
	};
};

Deno.serve(
	serviceOnly(async (key) =>
		Response.json({
			status: "ok",
			...(await fetchExchangeRates(adaptersFor(key), new Date())),
		}),
	),
);
