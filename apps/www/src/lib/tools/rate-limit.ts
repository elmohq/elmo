import { getRequest } from "@tanstack/react-start/server";
import { Redis } from "@upstash/redis";
import { ToolError } from "./site-url";

/**
 * A per-IP cap on the free tools. They cost nothing per run, but they do fetch
 * arbitrary URLs on request, and an uncapped endpoint that does that is a
 * crawler someone else gets to point.
 *
 * Fails open: when Upstash is not configured (local dev) or is unreachable, the
 * request proceeds. Losing the limiter should not take the tools down with it.
 */

const WINDOW_SECONDS = 60;

let client: Redis | null | undefined;

function redis(): Redis | null {
	if (client !== undefined) return client;

	const url = process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;
	client = url && token ? new Redis({ url, token }) : null;
	return client;
}

function clientIp(): string {
	const headers = getRequest().headers;
	// The left-most entry is the original client; the rest are proxies.
	const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
	return forwarded || headers.get("x-real-ip") || "unknown";
}

export async function enforceRateLimit(bucket: string, limit: number): Promise<void> {
	const store = redis();
	if (!store) return;

	const key = `tools:rate:${bucket}:${clientIp()}`;

	try {
		const used = await store.incr(key);
		if (used === 1) await store.expire(key, WINDOW_SECONDS);
		if (used <= limit) return;
	} catch {
		return;
	}

	throw new ToolError("You're going a bit fast for our free tools. Wait a minute and try again.");
}
