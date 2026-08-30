import type { db } from "./db";

/** The db handle or an open transaction, so a step can join a caller's transaction. */
export type DbConnection = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
