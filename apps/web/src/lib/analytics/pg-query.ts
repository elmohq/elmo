import { db } from "@workspace/lib/db/db";
import type { SqlQuery } from "@/lib/analytics-sql";

export const queryPg: SqlQuery = async <T>(query: Parameters<SqlQuery>[0]) => (await db.execute(query)).rows as T[];
