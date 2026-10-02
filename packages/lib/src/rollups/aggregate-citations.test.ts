import { describe, expect, it } from "vitest";
import { aggregateCitationBucket, type CitationSourceRow } from "./aggregate-citations";
import { CLASSIFIER_VERSION } from "./constants";

const BUCKET_A = "2026-01-15T10:00:00.000Z";
const BUCKET_B = "2026-01-15T10:30:00.000Z";

function row(overrides: Partial<CitationSourceRow> = {}): CitationSourceRow {
	return {
		brandId: "brand",
		promptId: "11111111-1111-1111-1111-111111111111",
		createdAt: new Date("2026-01-15T10:05:00.000Z"),
		model: "gpt-5",
		provider: "openai-api",
		webSearchEnabled: true,
		url: "https://example.com/guide",
		domain: "example.com",
		title: "A guide",
		citationIndex: 1,
		...overrides,
	};
}

describe("aggregateCitationBucket", () => {
	it("folds tracking-parameter and www variants of one page together", () => {
		const { urls, pages } = aggregateCitationBucket([
			row({ url: "https://example.com/guide" }),
			row({ url: "https://www.example.com/guide/" }),
			row({ url: "https://example.com/guide?utm_source=openai" }),
		]);

		expect(urls).toHaveLength(1);
		expect(urls[0]).toMatchObject({ url: "https://example.com/guide", citations: 3 });
		expect(pages.map((page) => page.url)).toEqual(["https://example.com/guide"]);
	});

	it("keeps pages whose query strings differ apart", () => {
		const { urls } = aggregateCitationBucket([
			row({ url: "https://example.com/guide?page=1" }),
			row({ url: "https://example.com/guide?page=2" }),
		]);
		expect(urls).toHaveLength(2);
	});

	it("takes the most recent non-null title", () => {
		const { pages, urls } = aggregateCitationBucket([
			row({ createdAt: new Date("2026-01-15T10:20:00.000Z"), title: "Newer title" }),
			row({ createdAt: new Date("2026-01-15T10:05:00.000Z"), title: "Older title" }),
			row({ createdAt: new Date("2026-01-15T10:25:00.000Z"), title: null }),
			row({ createdAt: new Date("2026-01-15T10:27:00.000Z"), title: "   " }),
		]);

		expect(pages[0].title).toBe("Newer title");
		expect(urls[0].citations).toBe(4);
	});

	it("records the window a page was seen in", () => {
		const { pages } = aggregateCitationBucket([
			row({ createdAt: new Date("2026-01-15T10:20:00.000Z") }),
			row({ createdAt: new Date("2026-01-15T10:05:00.000Z") }),
			row({ createdAt: new Date("2026-01-15T10:45:00.000Z") }),
		]);

		expect(pages[0].firstSeenAt.toISOString()).toBe("2026-01-15T10:05:00.000Z");
		expect(pages[0].lastSeenAt.toISOString()).toBe("2026-01-15T10:45:00.000Z");
		expect(pages[0].classifierVersion).toBe(CLASSIFIER_VERSION);
	});

	it("flags Google search and shopping surfaces", () => {
		const { pages } = aggregateCitationBucket([
			row({ url: "https://www.google.com/search?q=best+crm", domain: "google.com", title: "best crm" }),
			row({
				url: "https://www.google.com/search?q=product&prds=pvt:hg,productid:123",
				domain: "google.com",
				title: "A product",
			}),
		]);

		expect(pages.map((page) => page.staticCategory)).toEqual(["google", "google"]);
		expect(pages.map((page) => page.pageType).sort()).toEqual(["search", "shopping"]);
	});

	it("classifies non-Google pages from the domain lists", () => {
		const { pages } = aggregateCitationBucket([
			row({ url: "https://www.reddit.com/r/crm/comments/1", domain: "reddit.com", title: "Which CRM?" }),
		]);

		expect(pages[0].staticCategory).toBe("social");
	});

	it("counts positions only for citations that reported one", () => {
		const { urls } = aggregateCitationBucket([
			row({ citationIndex: 1 }),
			row({ citationIndex: 3 }),
			row({ citationIndex: null }),
		]);

		expect(urls[0]).toMatchObject({ citations: 3, positionSum: 4, positionCount: 2 });
	});

	it("stores a missing provider as the empty string", () => {
		const { urls } = aggregateCitationBucket([row({ provider: null })]);
		expect(urls[0].provider).toBe("");
	});

	it("splits rows by bucket, prompt, model and grounding", () => {
		const { urls, pages } = aggregateCitationBucket([
			row({ createdAt: new Date("2026-01-15T10:05:00.000Z") }),
			row({ createdAt: new Date("2026-01-15T10:35:00.000Z") }),
			row({ createdAt: new Date("2026-01-15T10:55:00.000Z"), model: "claude-sonnet-4-5" }),
			row({ createdAt: new Date("2026-01-15T10:40:00.000Z"), webSearchEnabled: false }),
		]);

		expect(urls.map((u) => [u.bucket.toISOString(), u.model, u.webSearchEnabled, u.citations])).toEqual([
			[BUCKET_A, "gpt-5", true, 1],
			[BUCKET_B, "claude-sonnet-4-5", true, 1],
			[BUCKET_B, "gpt-5", false, 1],
			[BUCKET_B, "gpt-5", true, 1],
		]);
		expect(pages).toHaveLength(1);
	});

	it("is order-independent and deterministic", () => {
		const rows = [
			row({ url: "https://example.com/b", createdAt: new Date("2026-01-15T10:20:00.000Z") }),
			row({ url: "https://example.com/a", createdAt: new Date("2026-01-15T10:05:00.000Z") }),
			row({ url: "https://example.com/a", createdAt: new Date("2026-01-15T10:25:00.000Z"), title: "Newest" }),
		];
		expect(aggregateCitationBucket(rows)).toEqual(aggregateCitationBucket([...rows].reverse()));
	});

	it("returns nothing for no rows", () => {
		expect(aggregateCitationBucket([])).toEqual({ pages: [], urls: [] });
	});
});
