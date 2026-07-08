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
import { CACHE_TTL_SECONDS, REPO } from "./constants";
import { fetchRepoActivityData } from "./github";
import type { RepoActivityData } from "./types";

const DATA_KEY = `repo-activity:data:${REPO}`;
const FRESH_KEY = `repo-activity:fresh:${REPO}`;
const FRESH_TTL_SECONDS = CACHE_TTL_SECONDS;
/** Shorter freshness when the commit chart is still empty, so it retries soon. */
const RETRY_TTL_SECONDS = 60;
const DATA_TTL_SECONDS = 24 * 60 * 60;

function redisClient(): Redis | null {
	const url = process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;
	if (!url || !token) return null;
	return new Redis({ url, token });
}

export async function getRepoActivityData(): Promise<RepoActivityData> {
	const redis = redisClient();
	if (!redis) return fetchRepoActivityData();

	const [lastGood, fresh] = await Promise.all([
		redis.get<RepoActivityData>(DATA_KEY),
		redis.get<number>(FRESH_KEY),
	]);
	if (lastGood && fresh) return lastGood;

	try {
		const data = await fetchRepoActivityData();

		// `/stats/commit_activity` answers 202 while GitHub computes it, so a fresh
		// snapshot can arrive with an empty commit series. Don't let that regress a
		// chart we already had: carry over the last-good week data, and mark the
		// snapshot fresh for only a short window so it refetches (and heals) soon.
		const missingCommits = data.commitsByWeek.length === 0;
		if (missingCommits && lastGood && lastGood.commitsByWeek.length > 0) {
			data.commitsByWeek = lastGood.commitsByWeek;
			data.releaseWeeks = lastGood.releaseWeeks;
			data.kpis.commits = lastGood.kpis.commits;
		}
		const stillMissing = data.commitsByWeek.length === 0;

		await Promise.all([
			redis.set(DATA_KEY, data, { ex: DATA_TTL_SECONDS }),
			redis.set(FRESH_KEY, 1, { ex: stillMissing ? RETRY_TTL_SECONDS : FRESH_TTL_SECONDS }),
		]);
		return data;
	} catch (error) {
		if (lastGood) return lastGood;
		throw error;
	}
}
