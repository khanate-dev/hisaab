import { defineConfig } from "drizzle-kit";

import { getTursoCredentials } from "~/db/turso.config";

export default defineConfig({
	schema: "./app/db/db.schema.ts",
	out: "./drizzle",
	dialect: "turso",
	dbCredentials: getTursoCredentials(),
});
