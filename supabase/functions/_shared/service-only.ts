// Edge Functions only the service role may run (pg_cron calls them with its key). A key that can't be the service
// role's is turned away at once; any other is used for the function's own database and Storage calls, so the
// database decides (`forbidden()` maps its refusal to a 403).
import { mayBeServiceKey } from "../../../packages/domain/src/notifications.ts";

/** The database or Storage refused the caller's key. */
export class Forbidden extends Error {}

/** Whether a response means the key was refused: 401, 403, or the contract version gate's 426. */
export const refused = (status: number) =>
	status === 401 || status === 403 || status === 426;

export const serviceOnly =
	(run: (key: string) => Promise<Response>) =>
	async (request: Request): Promise<Response> => {
		if (request.method !== "POST")
			return Response.json({ status: "method_not_allowed" }, { status: 405 });
		const key = /^Bearer (.+)$/.exec(
			request.headers.get("authorization") ?? "",
		)?.[1];
		if (!key || !mayBeServiceKey(key))
			return Response.json({ status: "forbidden" }, { status: 403 });
		try {
			return await run(key);
		} catch (error) {
			if (error instanceof Forbidden)
				return Response.json({ status: "forbidden" }, { status: 403 });
			throw error;
		}
	};
