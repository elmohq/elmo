import { describe, expect, it } from "vitest";
import { aiCrawlerAccess, isAllowedByRobots } from "./robots";

describe("isAllowedByRobots", () => {
	it("allows everything when there are no rules", () => {
		expect(isAllowedByRobots("", "GPTBot")).toBe(true);
	});

	it("blocks a crawler named in its own group", () => {
		const robots = "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /";
		expect(isAllowedByRobots(robots, "GPTBot")).toBe(false);
		expect(isAllowedByRobots(robots, "ClaudeBot")).toBe(true);
	});

	it("falls back to the wildcard group", () => {
		expect(isAllowedByRobots("User-agent: *\nDisallow: /", "PerplexityBot")).toBe(false);
	});

	it("lets a crawler's own group override a wildcard block", () => {
		const robots = "User-agent: *\nDisallow: /\n\nUser-agent: OAI-SearchBot\nAllow: /";
		expect(isAllowedByRobots(robots, "OAI-SearchBot")).toBe(true);
		expect(isAllowedByRobots(robots, "GPTBot")).toBe(false);
	});

	it("matches user agents case-insensitively and across grouped lines", () => {
		const robots = "user-agent: gptbot\nUser-Agent: CCBot\ndisallow: /";
		expect(isAllowedByRobots(robots, "GPTBot")).toBe(false);
		expect(isAllowedByRobots(robots, "CCBot")).toBe(false);
	});

	it("treats an empty Disallow as allow-all", () => {
		expect(isAllowedByRobots("User-agent: ClaudeBot\nDisallow:", "ClaudeBot")).toBe(true);
	});

	it("only blocks the homepage when a rule actually covers it", () => {
		expect(isAllowedByRobots("User-agent: *\nDisallow: /admin\nDisallow: /*.pdf$", "GPTBot")).toBe(true);
	});

	it("prefers the longest matching rule and Allow on a tie", () => {
		expect(isAllowedByRobots("User-agent: *\nDisallow: /\nAllow: /$", "GPTBot", "/")).toBe(true);
		expect(isAllowedByRobots("User-agent: *\nDisallow: /\nAllow: /$", "GPTBot", "/pricing")).toBe(false);
		expect(isAllowedByRobots("User-agent: *\nDisallow: /\nAllow: /", "GPTBot")).toBe(true);
	});

	it("ignores comments and blank lines", () => {
		const robots = "# AI crawlers\nUser-agent: Google-Extended # Gemini\n\nDisallow: / # no thanks";
		expect(isAllowedByRobots(robots, "Google-Extended")).toBe(false);
	});
});

describe("aiCrawlerAccess", () => {
	it("reports each AI crawler", () => {
		const access = aiCrawlerAccess("User-agent: GPTBot\nDisallow: /");
		expect(access.find((entry) => entry.crawler.token === "GPTBot")?.access).toBe("blocked");
		expect(access.find((entry) => entry.crawler.token === "OAI-SearchBot")?.access).toBe("allowed");
	});

	it("reports unknown when robots.txt couldn't be read", () => {
		expect(aiCrawlerAccess(null).every((entry) => entry.access === "unknown")).toBe(true);
	});
});
