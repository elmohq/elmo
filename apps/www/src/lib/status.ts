import { Redis } from "@upstash/redis";
import { createServerFn } from "@tanstack/react-start";
import { STATUS_TARGETS } from "@workspace/config/scrape-targets";
import type { StatusEntry, TargetStatus } from "./status-helpers";

export type { StatusEntry, TargetStatus } from "./status-helpers";

const redis = new Redis({
	url: process.env.UPSTASH_REDIS_REST_URL!,
	token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Plain loader shared by the status page's server function and the status share
// image route, so both read the same 7-day window from the same source.
export async function loadStatusData(): Promise<TargetStatus[]> {
	const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

	return Promise.all(
		STATUS_TARGETS.map(async (target) => {
			const key = `provider-status:${target}`;
			const raw: string[] = await redis.zrange(key, sevenDaysAgo, "+inf", {
				byScore: true,
			});

			const entries: StatusEntry[] = raw.map((item) => {
				if (typeof item === "string") return JSON.parse(item);
				return item as unknown as StatusEntry;
			});

			return { target, entries };
		}),
	);
}

export const getStatusData = createServerFn({ method: "GET" }).handler(async () => loadStatusData());
