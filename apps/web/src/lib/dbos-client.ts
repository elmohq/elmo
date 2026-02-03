import { DBOSClient } from "@dbos-inc/dbos-sdk";

let dbosClientPromise: Promise<DBOSClient> | null = null;

export async function getDbosClient(): Promise<DBOSClient> {
	if (!dbosClientPromise) {
		dbosClientPromise = DBOSClient.create({
			systemDatabaseUrl: process.env.DBOS_SYSTEM_DATABASE_URL,
		});
	}

	return dbosClientPromise;
}
