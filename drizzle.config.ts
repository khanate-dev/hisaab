import { getTursoCredentials } from "~/db/turso.config";

import type { Config } from "drizzle-kit";

export default {
	schema: "./db/db.schema.ts",
	out: "./migrations",
	dialect: "turso",
	dbCredentials: getTursoCredentials(),
} satisfies Config;
