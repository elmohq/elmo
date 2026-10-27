import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export function createDb(url: string) {
	return drizzle({
		connection: {
			connectionString: url,
			// Without a limit, a request waits forever on a database or pooler that
			// isn't answering. This also bounds the wait for a free client when the
			// pool is busy, so it's generous enough for the worker's job bursts.
			connectionTimeoutMillis: 15_000,
			// Short so idle clients are closed before a serverless instance suspends.
			idleTimeoutMillis: 5_000,
		},
		schema,
	});
}

export const db = createDb(process.env.DATABASE_URL!);
