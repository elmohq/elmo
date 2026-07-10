import { Redis } from "@upstash/redis";
import { createServerFn } from "@tanstack/react-start";
import { STATUS_TARGETS } from "@workspace/config/scrape-targets";

const redis = new Redis({
	url: process.env.UPSTASH_REDIS_REST_URL!,
	token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export interface StatusEntry {
	ts: string;
	status: "pass" | "fail";
	latency: number;
	retries: number;
	textLength: number;
	rawOutputBytes: number;
	citations: number;
	webQueries: number;
	webSearch: boolean;
	error: string | null;
}

export interface TargetStatus {
	target: string;
	entries: StatusEntry[];
}

export const getStatusData = createServerFn({ method: "GET" }).handler(
	async () => {
		const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

		const results: TargetStatus[] = await Promise.all(
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

		return results;
	},
);
