import { describe, expect, it } from "vitest";
import { evaluate, parseRobotsTxt } from "./robots";

const check = (robotsTxt: string, agent: string, path = "/") => evaluate(parseRobotsTxt(robotsTxt), agent, path);

describe("robots.txt evaluation", () => {
	it("allows everything when the file has no rules", () => {
		expect(check("", "GPTBot").allowed).toBe(true);
		expect(check("# just a comment\n", "GPTBot").allowed).toBe(true);
	});

	it("blocks every crawler on a blanket disallow", () => {
		const robotsTxt = "User-agent: *\nDisallow: /";
		expect(check(robotsTxt, "GPTBot").allowed).toBe(false);
		expect(check(robotsTxt, "Googlebot").allowed).toBe(false);
	});

	it("treats an empty Disallow as allowing everything", () => {
		expect(check("User-agent: *\nDisallow:", "ClaudeBot").allowed).toBe(true);
	});

	it("makes a named group override the catch-all entirely", () => {
		const robotsTxt = ["User-agent: *", "Allow: /", "", "User-agent: GPTBot", "Disallow: /"].join("\n");
		expect(check(robotsTxt, "GPTBot").allowed).toBe(false);
		expect(check(robotsTxt, "PerplexityBot").allowed).toBe(true);
	});

	it("lets a named group escape a catch-all disallow", () => {
		const robotsTxt = ["User-agent: *", "Disallow: /", "", "User-agent: OAI-SearchBot", "Allow: /"].join("\n");
		expect(check(robotsTxt, "OAI-SearchBot").allowed).toBe(true);
		expect(check(robotsTxt, "CCBot").allowed).toBe(false);
	});

	it("matches user-agents case-insensitively", () => {
		expect(check("User-Agent: gptbot\nDisallow: /", "GPTBot").allowed).toBe(false);
	});

	it("applies a group to every user-agent in its header", () => {
		const robotsTxt = ["User-agent: GPTBot", "User-agent: CCBot", "Disallow: /"].join("\n");
		expect(check(robotsTxt, "GPTBot").allowed).toBe(false);
		expect(check(robotsTxt, "CCBot").allowed).toBe(false);
		expect(check(robotsTxt, "ClaudeBot").allowed).toBe(true);
	});

	it("prefers the longest matching path rule", () => {
		const robotsTxt = ["User-agent: *", "Disallow: /", "Allow: /blog/"].join("\n");
		expect(check(robotsTxt, "Googlebot", "/blog/post").allowed).toBe(true);
		expect(check(robotsTxt, "Googlebot", "/pricing").allowed).toBe(false);
	});

	it("resolves an equal-length tie in favor of allowing", () => {
		const robotsTxt = ["User-agent: *", "Disallow: /docs", "Allow: /docs"].join("\n");
		expect(check(robotsTxt, "Googlebot", "/docs").allowed).toBe(true);
	});

	it("honors wildcards and end-of-path anchors", () => {
		const robotsTxt = ["User-agent: *", "Disallow: /*.pdf$"].join("\n");
		expect(check(robotsTxt, "Googlebot", "/files/report.pdf").allowed).toBe(false);
		expect(check(robotsTxt, "Googlebot", "/files/report.pdf.html").allowed).toBe(true);
	});

	it("keeps Google-Extended and Googlebot independent", () => {
		const robotsTxt = ["User-agent: Google-Extended", "Disallow: /"].join("\n");
		expect(check(robotsTxt, "Google-Extended").allowed).toBe(false);
		expect(check(robotsTxt, "Googlebot").allowed).toBe(true);
	});

	it("falls back to a prefix group when a bot has none of its own", () => {
		const robotsTxt = ["User-agent: Googlebot", "Disallow: /"].join("\n");
		expect(check(robotsTxt, "Googlebot-News").matchedAgent).toBe("googlebot");
		expect(check(robotsTxt, "Googlebot-News").allowed).toBe(false);
	});

	it("merges rules from repeated groups for the same agent", () => {
		const robotsTxt = [
			"User-agent: GPTBot",
			"Disallow: /private/",
			"",
			"User-agent: GPTBot",
			"Disallow: /",
			"Allow: /blog/",
		].join("\n");
		expect(check(robotsTxt, "GPTBot", "/blog/post").allowed).toBe(true);
		expect(check(robotsTxt, "GPTBot", "/private/x").allowed).toBe(false);
	});

	it("reports the rule and the other blocked paths behind a verdict", () => {
		const robotsTxt = ["User-agent: *", "Disallow: /admin/", "Disallow: /cart/"].join("\n");
		const verdict = check(robotsTxt, "PerplexityBot", "/");
		expect(verdict.allowed).toBe(true);
		expect(verdict.matchedRule).toBeNull();
		expect(verdict.disallowedPatterns).toEqual(["/admin/", "/cart/"]);

		const blocked = check(robotsTxt, "PerplexityBot", "/admin/users");
		expect(blocked.matchedRule).toEqual({ type: "disallow", pattern: "/admin/" });
	});

	it("ignores comments and blank lines", () => {
		const robotsTxt = ["# staging leftovers", "User-agent: * # everyone", "Disallow: / # whole site"].join("\n");
		expect(check(robotsTxt, "ClaudeBot").allowed).toBe(false);
	});

	it("collects sitemap declarations regardless of grouping", () => {
		const robotsTxt = [
			"Sitemap: https://example.com/sitemap.xml",
			"User-agent: *",
			"Disallow:",
			"sitemap: https://example.com/news.xml",
		].join("\n");
		expect(parseRobotsTxt(robotsTxt).sitemaps).toEqual([
			"https://example.com/sitemap.xml",
			"https://example.com/news.xml",
		]);
	});

	it("reads crawl-delay for the governing group", () => {
		const robotsTxt = ["User-agent: CCBot", "Crawl-delay: 10", "Disallow:"].join("\n");
		expect(check(robotsTxt, "CCBot").crawlDelay).toBe(10);
	});
});
