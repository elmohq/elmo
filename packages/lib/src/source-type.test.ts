import { describe, expect, it } from "vitest";
import { classifySourceType, summarizeSourceTypes } from "./source-type";

const c = (domain: string, url = "", title = "") => classifySourceType({ domain, url, title });

describe("classifySourceType", () => {
	it("flags own and competitor first", () => {
		expect(classifySourceType({ domain: "acme.com", url: "", isOwn: true })).toBe("own");
		expect(classifySourceType({ domain: "rival.com", url: "", isCompetitor: true })).toBe("competitor");
	});

	it("recognizes platform types", () => {
		expect(c("en.wikipedia.org")).toBe("wikipedia");
		expect(c("reddit.com", "https://reddit.com/r/saas/x")).toBe("community");
		expect(c("g2.com")).toBe("review");
		expect(c("youtube.com", "https://youtube.com/watch?v=1")).toBe("video");
		expect(c("linkedin.com")).toBe("social");
	});

	it("recognizes comparison/best-of content by url or title", () => {
		expect(c("blog.example.com", "https://blog.example.com/best-crm-tools")).toBe("comparison");
		expect(c("example.com", "https://example.com/post", "Asana vs Trello: which is better?")).toBe("comparison");
		expect(c("alternativeto.net")).toBe("comparison");
	});

	it("recognizes docs and news", () => {
		expect(c("docs.stripe.com", "https://docs.stripe.com/api")).toBe("docs");
		expect(c("example.com", "https://example.com/docs/getting-started")).toBe("docs");
		expect(c("techcrunch.com", "https://techcrunch.com/2024/01/01/x")).toBe("news");
	});

	it("falls back to other", () => {
		expect(c("randomblog.io", "https://randomblog.io/thoughts")).toBe("other");
	});

	it("prefers platform type over comparison pattern (reddit 'best' thread)", () => {
		expect(c("reddit.com", "https://reddit.com/r/x/best-tools")).toBe("community");
	});
});

describe("summarizeSourceTypes", () => {
	it("aggregates counts, shares, and example domains, sorted by count", () => {
		const summary = summarizeSourceTypes([
			{ domain: "g2.com", url: "", count: 10 },
			{ domain: "capterra.com", url: "", count: 5 },
			{ domain: "reddit.com", url: "https://reddit.com/r/x", count: 5 },
		]);
		expect(summary[0]).toMatchObject({ type: "review", count: 15 });
		expect(summary[0].share).toBeCloseTo(15 / 20, 5);
		expect(summary[0].examples).toEqual(["g2.com", "capterra.com"]);
		expect(summary.find((s) => s.type === "community")?.count).toBe(5);
	});
});
