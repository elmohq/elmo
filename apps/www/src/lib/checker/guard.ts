import { getRedis } from "@/lib/redis";
import type { CheckResult } from "./types";

const RESULT_TTL_SECONDS = 24 * 60 * 60;
const PER_IP_DAILY_LIMIT = 5;
// Each fresh check costs roughly $0.05–0.20 in model and search calls.
const DEFAULT_GLOBAL_DAILY_LIMIT = 300;

function redisConfigured(): boolean {
	return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

export function resultCacheKey(input: { domain: string; brandName?: string; category?: string }): string {
	const part = (value?: string) => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
	return `checker:result:v1:${input.domain}:${part(input.brandName)}:${part(input.category)}`;
}

export async function cachedResult(key: string): Promise<CheckResult | null> {
	if (!redisConfigured()) return null;
	try {
		return (await getRedis().get<CheckResult>(key)) ?? null;
	} catch (error) {
		console.error("[ai-visibility-checker] cache read failed", error);
		return null;
	}
}

export async function cacheResult(key: string, result: CheckResult): Promise<void> {
	if (!redisConfigured()) return;
	try {
		await getRedis().set(key, result, { ex: RESULT_TTL_SECONDS });
	} catch (error) {
		console.error("[ai-visibility-checker] cache write failed", error);
	}
}

async function increment(key: string): Promise<number> {
	const redis = getRedis();
	const count = await redis.incr(key);
	if (count === 1) await redis.expire(key, RESULT_TTL_SECONDS);
	return count;
}

/**
 * Count a fresh (uncached) check against the visitor's and the site-wide daily
 * budget. Without Redis (local development) there is nothing to count against;
 * if Redis is down in production we let checks through and rely on Turnstile,
 * rather than take the tool offline.
 */
export async function consumeCheckQuota(ip: string): Promise<{ ok: true } | { ok: false; message: string }> {
	if (!redisConfigured()) return { ok: true };
	const globalLimit = Number(process.env.AI_VISIBILITY_CHECKER_DAILY_LIMIT) || DEFAULT_GLOBAL_DAILY_LIMIT;
	try {
		if ((await increment(`checker:ip:${today()}:${ip}`)) > PER_IP_DAILY_LIMIT) {
			return {
				ok: false,
				message: `You've run ${PER_IP_DAILY_LIMIT} checks today. Come back tomorrow, or track every day with Elmo Cloud.`,
			};
		}
		if ((await increment(`checker:global:${today()}`)) > globalLimit) {
			return {
				ok: false,
				message: "The free checker has hit its daily limit. Try again tomorrow, or track every day with Elmo Cloud.",
			};
		}
	} catch (error) {
		console.error("[ai-visibility-checker] quota check failed", error);
	}
	return { ok: true };
}

/**
 * Cloudflare Turnstile verification. Skipped only when no secret is configured
 * outside production, so local development works without a Cloudflare account.
 */
export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
	const secret = process.env.TURNSTILE_SECRET_KEY;
	if (!secret) return process.env.NODE_ENV !== "production";
	if (!token) return false;
	try {
		const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
			method: "POST",
			body: new URLSearchParams({ secret, response: token, remoteip: ip }),
			signal: AbortSignal.timeout(8000),
		});
		const outcome = (await response.json()) as { success?: boolean };
		return outcome.success === true;
	} catch (error) {
		console.error("[ai-visibility-checker] turnstile verification failed", error);
		return false;
	}
}

export function clientIp(request: Request): string {
	const forwarded =
		request.headers.get("x-vercel-forwarded-for") ??
		request.headers.get("x-real-ip") ??
		request.headers.get("x-forwarded-for");
	return forwarded?.split(",")[0]?.trim() || "unknown";
}
