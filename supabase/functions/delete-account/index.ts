// Account deletion (spec §3.1, #64): for the signed-in User, behind a fresh email OTP and a typed confirmation. The
// logic is in packages/domain behind adapters (ADR-0010); this wires them to Auth, PostgREST and Storage as the service
// role. The deletion itself is one database transaction (`delete_account`).
import {
	type AccountDeletionAdapters,
	type BlockingHousehold,
	handleDeleteAccountRequest,
	otpSignedInAt,
} from "../../../packages/domain/src/account-deletion.ts";
import { withContractVersion } from "../_shared/contract-version.ts";

const env = (name: string) => {
	const value = Deno.env.get(name);
	if (!value) throw new Error(`${name} must be set`);
	return value;
};

const url = env("SUPABASE_URL");
const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
const asService = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

const call = async (path: string, init: RequestInit = {}) => {
	const response = await fetch(`${url}${path}`, {
		...init,
		headers: {
			...asService,
			"content-type": "application/json",
			...init.headers,
		},
	});
	if (!response.ok)
		throw new Error(
			`${path.split("?")[0]} answered ${response.status}: ${await response.text()}`,
		);
	const text = await response.text();
	return text === "" ? null : JSON.parse(text);
};

const BUCKET = "attachments";

const adapters: AccountDeletionAdapters = {
	userFor: async (token) => {
		// Auth checks the token; only then are its claims read.
		const response = await fetch(`${url}/auth/v1/user`, {
			headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
		});
		if (!response.ok) return null;
		const user = (await response.json()) as { id?: string };
		return user.id ? { id: user.id, otpAt: otpSignedInAt(token) } : null;
	},
	blockers: async (userId) =>
		(
			(await call("/rest/v1/rpc/account_deletion_blockers", {
				method: "POST",
				body: JSON.stringify({ target_user: userId }),
			})) as { household_id: string; name: string }[]
		).map((row): BlockingHousehold => ({
			householdId: row.household_id,
			name: row.name,
		})),
	deleteAccount: async (userId) =>
		await call("/rest/v1/rpc/delete_account", {
			method: "POST",
			body: JSON.stringify({ target_user: userId }),
		}),
	purgeHouseholdFiles: async (householdIds) => {
		for (const householdId of householdIds) {
			// A household's files are all in its own folder.
			for (;;) {
				const listed = (await call(`/storage/v1/object/list/${BUCKET}`, {
					method: "POST",
					body: JSON.stringify({ prefix: householdId, limit: 100, offset: 0 }),
				})) as { name: string }[];
				if (listed.length === 0) break;
				await call(`/storage/v1/object/${BUCKET}`, {
					method: "DELETE",
					body: JSON.stringify({
						prefixes: listed.map((f) => `${householdId}/${f.name}`),
					}),
				});
			}
		}
	},
};

// Browsers call it from the web app, so it answers CORS like the platform's own functions.
const CORS = {
	"access-control-allow-origin": "*",
	"access-control-allow-headers":
		"authorization, x-client-info, apikey, content-type, x-contract-version",
	"access-control-allow-methods": "POST, OPTIONS",
};

const handle = withContractVersion((request) =>
	handleDeleteAccountRequest(adapters, request, Date.now()),
);

Deno.serve(async (request) => {
	if (request.method === "OPTIONS")
		return new Response("ok", { headers: CORS });
	// A fault (say, two deletions in one household at once) still answers JSON, CORS and all, so the app can say so.
	let response: Response;
	try {
		response = await handle(request);
	} catch (error) {
		console.error(error);
		response = Response.json({ status: "error" }, { status: 500 });
	}
	for (const [name, value] of Object.entries(CORS))
		response.headers.set(name, value);
	return response;
});
