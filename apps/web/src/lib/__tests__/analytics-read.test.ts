import { describe, expect, it, vi } from "vitest";
import type { PerPromptDailyCitationPageRow } from "@/lib/postgres-read";

// A module this thin would trip the eager-property-access bug the gated()
// facade used to have: every `export const x = gated(rollup.x, raw.x)` read
// `raw.x` at module-evaluation time, so importing analytics-read.ts touched
// every export postgres-read.ts has — vitest's mocked-module guard throws the
// moment code reads an export a mock factory didn't return, so a test that
// only needs one or two functions (like this one) used to blow up the whole
// module graph just by being imported.
vi.mock("@/lib/postgres-read", () => ({
	getPromptRuns: async () => [],
}));

const { classifyDailyPages } = await import("@/lib/analytics-read");

describe("importing the facade", () => {
	it("doesn't eagerly touch exports a partial postgres-read mock doesn't provide", async () => {
		await expect(import("@/lib/analytics-read")).resolves.toBeDefined();
	});
});

describe("classifyDailyPages", () => {
	const row = (overrides: Partial<PerPromptDailyCitationPageRow>): PerPromptDailyCitationPageRow => ({
		prompt_id: "prompt-1",
		date: "2026-01-01",
		url: "https://blog.example.com/blog/great-post",
		domain: "blog.example.com",
		title: "Great post",
		count: 1,
		...overrides,
	});

	it("classifies each row the tenant-independent way (no brand/competitor domains) and carries the count", () => {
		const [result] = classifyDailyPages([row({ count: 3 })]);
		// An uncategorized domain falls to the page-type fallback: an /blog/ path
		// reads as "article", and an "other"-category article reads as editorial —
		// the same classifyUrl behavior classifyPage applies at rebuild time.
		expect(result).toEqual({
			prompt_id: "prompt-1",
			date: "2026-01-01",
			domain: "blog.example.com",
			static_category: "editorial",
			page_type: "article",
			count: 3,
		});
	});

	it("folds distinct URLs that land on the same (prompt, day, domain, category, page type) key", () => {
		const rows = [
			row({ url: "https://blog.example.com/blog/great-post", count: 3 }),
			row({ url: "https://blog.example.com/blog/another-post", title: "Another post", count: 2 }),
		];
		const result = classifyDailyPages(rows);
		expect(result).toHaveLength(1);
		expect(result[0].count).toBe(5);
	});

	it("keeps distinct classifications as separate rows", () => {
		const rows = [
			row({ url: "https://blog.example.com/blog/great-post", count: 3 }),
			row({
				url: "https://shop.example.com/products/widget",
				domain: "shop.example.com",
				title: null,
				count: 4,
			}),
		];
		const result = classifyDailyPages(rows);
		const byDomain = new Map(result.map((r) => [r.domain, r]));
		expect(byDomain.get("blog.example.com")).toMatchObject({ static_category: "editorial", page_type: "article" });
		expect(byDomain.get("shop.example.com")).toMatchObject({ static_category: "ecommerce", page_type: "product" });
	});

	it("drops a row with no URL, the way a citation row with a page_id always has one", () => {
		const result = classifyDailyPages([row({ url: null, count: 5 })]);
		expect(result).toEqual([]);
	});
});
