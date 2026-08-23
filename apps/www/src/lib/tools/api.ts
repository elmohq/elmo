import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SUMMARY_BATCH_SIZE } from "./limits";
import { ToolError } from "./site-url";
import type { CrawlerCheckResult, PageSummary, SiteDiscovery } from "./types";

/**
 * Server entry points for the free tools.
 *
 * Failures come back as data rather than thrown errors: every one of these is a
 * message about somebody else's website ("no sitemap found", "took too long"),
 * and that is the answer the visitor came for, not a crash.
 *
 * The handlers import their implementations lazily so the fetcher and its
 * node:dns dependency stay out of the client bundle, the same way the blog and
 * docs routes keep their sources server-side.
 */
export type ToolResponse<T> = { ok: true; data: T } | { ok: false; error: string };

/** Long enough for any real URL, short enough that nothing here is a payload. */
const urlString = z.string().max(2048);
const siteInput = z.object({ url: urlString });
const pagesInput = z.object({ urls: z.array(urlString).max(SUMMARY_BATCH_SIZE) });

async function run<T>(bucket: string, limit: number, work: () => Promise<T>): Promise<ToolResponse<T>> {
	try {
		const { enforceRateLimit } = await import("./rate-limit");
		await enforceRateLimit(bucket, limit);
		return { ok: true, data: await work() };
	} catch (error) {
		if (error instanceof ToolError) return { ok: false, error: error.message };
		console.error(`tool ${bucket} failed`, error);
		return { ok: false, error: "Something went wrong on our side. Try again in a moment." };
	}
}

export const checkAiCrawlersFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => siteInput.parse(data))
	.handler(
		async ({ data }): Promise<ToolResponse<CrawlerCheckResult>> =>
			run("crawler-check", 20, async () => {
				const { checkAiCrawlers } = await import("./crawler-check");
				return checkAiCrawlers(data.url);
			}),
	);

export const discoverSiteFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => siteInput.parse(data))
	.handler(
		async ({ data }): Promise<ToolResponse<SiteDiscovery>> =>
			run("discover-site", 10, async () => {
				const { discoverSite } = await import("./site-discovery");
				return discoverSite(data.url);
			}),
	);

export const describePagesFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => pagesInput.parse(data))
	.handler(
		async ({ data }): Promise<ToolResponse<PageSummary[]>> =>
			run("describe-pages", 20, async () => {
				const { describePages } = await import("./site-discovery");
				return describePages(data.urls);
			}),
	);
