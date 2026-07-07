/**
 * Upstash-backed cache for the repo-activity snapshot, using a stale-while-
 * revalidate pattern:
 *  - `FRESH_KEY` (5 min TTL) marks the data as fresh; while set, we serve the
 *    cached copy without touching GitHub.
 *  - `DATA_KEY` (24 h TTL) holds the last-good snapshot. When the freshness flag
 *    expires we refetch; if GitHub errors (rate limit, outage) we keep serving
 *    the last-good copy rather than an empty graphic.
 *
 * With no Upstash env configured it falls back to fetching directly per request.
 */

import { Redis } from "@upstash/redis";
import { REPO } from "./constants";
import { fetchRepobeatsData } from "./github";
import type { RepobeatsData } from "./types";

const DATA_KEY = `repobeats:data:${REPO}`;
const FRESH_KEY = `repobeats:fresh:${REPO}`;
const FRESH_TTL_SECONDS = 5 * 60;
const DATA_TTL_SECONDS = 24 * 60 * 60;

function redisClient(): Redis | null {
	const url = process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;
	if (!url || !token) return null;
	return new Redis({ url, token });
}

export async function getRepobeatsData(): Promise<RepobeatsData> {
	const redis = redisClient();
	if (!redis) return fetchRepobeatsData();

	const [lastGood, fresh] = await Promise.all([
		redis.get<RepobeatsData>(DATA_KEY),
		redis.get<number>(FRESH_KEY),
	]);
	if (lastGood && fresh) return lastGood;

	try {
		const data = await fetchRepobeatsData();
		await Promise.all([
			redis.set(DATA_KEY, data, { ex: DATA_TTL_SECONDS }),
			redis.set(FRESH_KEY, 1, { ex: FRESH_TTL_SECONDS }),
		]);
		return data;
	} catch (error) {
		if (lastGood) return lastGood;
		throw error;
	}
}
