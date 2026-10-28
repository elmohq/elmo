import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getFanoutSupport } from "./fanout-support";
import { withFanoutSupport } from "./fanout-support-docs";
import { parseScrapeTargets } from "./scrape-targets";

const support = (target: string) => getFanoutSupport(parseScrapeTargets(target)[0]);

describe("getFanoutSupport", () => {
	it("reports when a provider stopped returning queries", () => {
		expect(support("chatgpt:brightdata:online")).toEqual({ status: "discontinued", since: "2026-09-27" });
	});

	it("tells a pinned DataForSEO model apart from its scraper", () => {
		expect(support("gemini:dataforseo:gemini-2.5-flash:online").status).toBe("supported");
		expect(support("gemini:dataforseo:online").status).toBe("never");
	});

	it("covers every model on a provider that never returns queries", () => {
		expect(support("deepseek:openrouter:deepseek/deepseek-v3.2:online").status).toBe("never");
	});

	it("doesn't guess for a target nobody has checked", () => {
		expect(support("perplexity:searchapi:online").status).toBe("unknown");
	});
});

describe("provider docs", () => {
	it("match the fan-out support table", () => {
		const mdx = readFileSync(new URL("../../docs/content/docs/user-guide/providers.mdx", import.meta.url), "utf8");
		expect(mdx, "run `pnpm --filter @workspace/config docs:fanout`").toBe(withFanoutSupport(mdx));
	});
});
