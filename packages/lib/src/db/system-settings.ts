import crypto from "node:crypto";
import { db } from "./db";
import { systemSettings } from "./schema";

const DEPLOYMENT_ID_KEY = "deployment_id";

let cached: string | null = null;

export async function getOrCreateDeploymentId(): Promise<string> {
	if (cached) return cached;

	const candidate = crypto.randomUUID();
	const [row] = await db
		.insert(systemSettings)
		.values({ key: DEPLOYMENT_ID_KEY, value: candidate })
		.onConflictDoUpdate({
			target: systemSettings.key,
			set: { key: systemSettings.key },
		})
		.returning({ value: systemSettings.value });

	cached = row.value;
	return cached;
}
