/**
 * Upstash-backed store for the repo-activity snapshot.
 *
 * Serving (`readRepoActivitySnapshot`) only ever reads `DATA_KEY`, so
 * `/repo-activity.svg` responds instantly and never blocks on GitHub — otherwise
 * the slow refetch rides on the request GitHub's Camo proxy is waiting for and it
 * times out to a broken image. A Vercel cron calls `refreshRepoActivitySnapshot`
 * to recompute and persist the snapshot out of band.
 *
 * With no Upstash env configured (local dev) both paths fetch directly.
 */

import { Redis } from "@upstash/redis";
import { REPO } from "./constants";
import { fetchRepoActivityData } from "./github";
import type { RepoActivityData } from "./types";

const DATA_KEY = `repo-activity:data:${REPO}`;
const DATA_TTL_SECONDS = 24 * 60 * 60;

function redisClient(): Redis | null {
	const url = process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;
	if (!url || !token) return null;
	return new Redis({ url, token });
}

/**
 * Read-only serving path: the warm snapshot the cron maintains, or `null` when it's
 * missing (cold start before the first cron run, or eviction) so the caller can fall
 * back to a placeholder rather than fetch on the request. Fetches directly only when
 * Upstash isn't configured (local dev), where Camo timeouts don't apply.
 */
export async function readRepoActivitySnapshot(): Promise<RepoActivityData | null> {
	const redis = redisClient();
	if (!redis) return fetchRepoActivityData();
	return redis.get<RepoActivityData>(DATA_KEY);
}

/** Cron path: recompute from GitHub and persist. Throws (leaving the last-good snapshot
 * intact) if the fetch fails, so a bad refresh never blanks the served image. */
export async function refreshRepoActivitySnapshot(): Promise<RepoActivityData> {
	const redis = redisClient();
	const data = await fetchRepoActivityData();
	if (!redis) return data;

	// `/stats/commit_activity` answers 202 (empty body) while GitHub recomputes it, so
	// a fresh snapshot can arrive with no commit series. Don't regress a chart we already
	// had: carry the last-good week data forward until a later refresh heals it.
	if (data.commitsByWeek.length === 0) {
		const lastGood = await redis.get<RepoActivityData>(DATA_KEY);
		if (lastGood && lastGood.commitsByWeek.length > 0) {
			data.commitsByWeek = lastGood.commitsByWeek;
			data.releaseWeeks = lastGood.releaseWeeks;
			data.kpis.commits = lastGood.kpis.commits;
		}
	}

	await redis.set(DATA_KEY, data, { ex: DATA_TTL_SECONDS });
	return data;
}
