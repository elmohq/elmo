import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export function createDb(url: string) {
	return drizzle(url, { schema });
}

export const db = createDb(process.env.DATABASE_URL!);
