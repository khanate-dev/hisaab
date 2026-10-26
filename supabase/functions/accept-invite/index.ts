// Invites (spec §3.1): previews an Invite for its landing, and accepts it for the signed-in User. The logic is in
// packages/domain behind adapters (ADR-0010); this wires them to PostgREST and Auth as the service role.
import {
	handleInviteRequest,
	type Invite,
	type InviteAdapters,
} from "../../../packages/domain/src/invites.ts";
import { withContractVersion } from "../_shared/contract-version.ts";

const env = (name: string) => {
	const value = Deno.env.get(name);
	if (!value) throw new Error(`${name} must be set`);
	return value;
};

const url = env("SUPABASE_URL");
const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
const asService = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

/** A PostgREST call as the service role; `what` names it in errors, never the path, which can carry a token. */
const rest = async (what: string, path: string, init: RequestInit = {}) => {
	const response = await fetch(`${url}/rest/v1/${path}`, {
		...init,
		headers: {
			...asService,
			"content-type": "application/json",
			...init.headers,
		},
	});
	if (!response.ok)
		throw new Error(
			`PostgREST ${path} answered ${response.status}: ${await response.text()}`,
		);
	return response.json();
};

type InviteRow = {
	id: string;
	household_id: string;
	role: Invite["role"];
	email: string | null;
	expires_at: string;
	revoked_at: string | null;
	accepted_at: string | null;
	households: { name: string };
};

const adapters: InviteAdapters = {
	findInvite: async (token) => {
		const [row] = (await rest(
			"findInvite",
			`invites?token=eq.${encodeURIComponent(token)}&select=id,household_id,role,email,expires_at,revoked_at,accepted_at,households(name)`,
		)) as InviteRow[];
		return row
			? {
					id: row.id,
					householdId: row.household_id,
					householdName: row.households.name,
					role: row.role,
					email: row.email,
					expiresAt: row.expires_at,
					revokedAt: row.revoked_at,
					acceptedAt: row.accepted_at,
				}
			: null;
	},
	currentUser: async (authorization) => {
		if (!authorization?.startsWith("Bearer ")) return null;
		const response = await fetch(`${url}/auth/v1/user`, {
			headers: { apikey: serviceKey, Authorization: authorization },
		});
		if (!response.ok) return null;
		const user = (await response.json()) as {
			id?: string;
			email?: string | null;
		};
		return user.id ? { id: user.id, email: user.email ?? null } : null;
	},
	isMember: async (householdId, userId) =>
		(
			(await rest(
				"isMember",
				`memberships?household_id=eq.${encodeURIComponent(householdId)}&user_id=eq.${encodeURIComponent(userId)}&select=id`,
			)) as unknown[]
		).length > 0,
	redeem: async (inviteId, userId) =>
		(await rest("redeem", "rpc/redeem_invite", {
			method: "POST",
			body: JSON.stringify({ target_invite: inviteId, joiner: userId }),
		})) as string | null,
	now: () => new Date(),
};

// Browsers call it from the web app, so it answers CORS like the platform's own functions.
const CORS = {
	"access-control-allow-origin": "*",
	"access-control-allow-headers":
		"authorization, x-client-info, apikey, content-type, x-contract-version",
	"access-control-allow-methods": "POST, OPTIONS",
};

const handle = withContractVersion((request) =>
	handleInviteRequest(adapters, request),
);

Deno.serve(async (request) => {
	if (request.method === "OPTIONS")
		return new Response("ok", { headers: CORS });
	const response = await handle(request);
	for (const [name, value] of Object.entries(CORS))
		response.headers.set(name, value);
	return response;
});
