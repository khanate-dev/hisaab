import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Keys come from the running local stack, so the secret key is never committed.
const readSupabaseStatus = () => {
	try {
		return JSON.parse(
			execFileSync("pnpm", ["exec", "supabase", "status", "--output", "json"], {
				cwd: fileURLToPath(new URL("../../..", import.meta.url)),
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			}),
		) as Record<"API_URL" | "PUBLISHABLE_KEY" | "SECRET_KEY", string>;
	} catch (cause) {
		throw new Error(
			"The local stack isn't running; start it with `pnpm stack:up`.",
			{ cause },
		);
	}
};
const status = readSupabaseStatus();

export const stack = {
	supabaseUrl: status.API_URL,
	publishableKey: status.PUBLISHABLE_KEY,
	secretKey: status.SECRET_KEY,
	powersyncUrl: process.env["POWERSYNC_URL"] ?? "http://localhost:55380",
};
