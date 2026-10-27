import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export function createDb(url: string) {
	return drizzle({
		connection: {
			connectionString: url,
			connectionTimeoutMillis: 15_000,
			idleTimeoutMillis: 5_000,
		},
		schema,
	});
}

export const db = createDb(process.env.DATABASE_URL!);
