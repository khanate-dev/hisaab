import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

export const getTursoCredentials = () => {
	const url = process.env.TURSO_DATABASE_URL;
	const authToken = process.env.TURSO_AUTH_TOKEN;

	if (!url) throw new Error("❌ TURSO_DATABASE_URL env is not set");
	if (!authToken) throw new Error("❌ TURSO_AUTH_TOKEN env is not set");

	return { url, authToken };
};

const turso = createClient(getTursoCredentials());

export const db = drizzle(turso);
