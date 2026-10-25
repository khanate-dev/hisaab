// ADR-0009 for Edge Functions: the same contract version check PostgREST runs, through packages/domain.
import { contractVersionResponse } from "../../../packages/domain/src/contract-version.ts";

/** The server's minimum, read as the service role (which the gate exempts). */
const readMinContractVersion = async () => {
	const url = Deno.env.get("SUPABASE_URL");
	const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
	if (!url || !key)
		throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");

	const response = await fetch(
		`${url}/rest/v1/app_config?select=min_contract_version`,
		{
			headers: { apikey: key, Authorization: `Bearer ${key}` },
		},
	);
	if (!response.ok)
		throw new Error(`Reading app_config failed: ${response.status}`);
	const [config] = (await response.json()) as {
		min_contract_version: number;
	}[];
	if (!config) throw new Error("app_config has no row");
	return config.min_contract_version;
};

/** Wraps a handler so a build below the minimum contract version gets 426 "Update required" instead. */
export const withContractVersion =
	(handler: (request: Request) => Response | Promise<Response>) =>
	async (request: Request) =>
		contractVersionResponse(request, await readMinContractVersion()) ??
		handler(request);
