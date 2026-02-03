import { DBOSClient } from "@dbos-inc/dbos-sdk";

let dbosClientPromise: Promise<DBOSClient> | null = null;

export async function getDbosClient(): Promise<DBOSClient> {
	if (!dbosClientPromise) {
		if (!process.env.DBOS_SYSTEM_DATABASE_URL) {
			throw new Error("DBOS_SYSTEM_DATABASE_URL is required");
		}
		const systemDatabaseUrl = process.env.DBOS_SYSTEM_DATABASE_URL as string;

		dbosClientPromise = DBOSClient.create({
			systemDatabaseUrl,
		});
	}

	return dbosClientPromise;
}
