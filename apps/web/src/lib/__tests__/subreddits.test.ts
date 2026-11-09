import { describe, expect, it } from "vitest";
import { extractSubreddit, isRedditDomain, summarizeSubreddits } from "@/lib/subreddits";

describe("isRedditDomain", () => {
	it.each(["reddit.com", "old.reddit.com", "www.reddit.com"])("accepts the Reddit domain %s", (domain) => {
		expect(isRedditDomain(domain)).toBe(true);
	});

	it.each(["notreddit.com", "reddit.com.evil.net", "redd.it"])("rejects the non-Reddit domain %s", (domain) => {
		expect(isRedditDomain(domain)).toBe(false);
	});
});

describe("extractSubreddit", () => {
	it("extracts the subreddit from a Reddit comment URL", () => {
		expect(extractSubreddit("https://www.reddit.com/r/running/comments/abc/title/")).toBe("r/running");
	});

	it.each(["?sort=top", "#top"])("stops the subreddit name before %s", (suffix) => {
		expect(extractSubreddit(`https://www.reddit.com/r/running${suffix}`)).toBe("r/running");
	});

	it.each(["https://www.reddit.com/user/someone", "https://www.reddit.com/", "https://www.reddit.com/r/"])(
		"returns null when the Reddit URL has no subreddit: %s",
		(url) => {
			expect(extractSubreddit(url)).toBeNull();
		},
	);

	it("returns null for a non-Reddit URL", () => {
		expect(extractSubreddit("https://example.com/r/running/comments/abc/title/")).toBeNull();
	});
});

describe("summarizeSubreddits", () => {
	it("returns no subreddits when there are no pages, even if URLs have dropped", () => {
		expect(summarizeSubreddits([])).toEqual([]);
		expect(summarizeSubreddits([], ["https://www.reddit.com/r/running/comments/dropped/"])).toEqual([]);
	});

	it("groups pages by subreddit and totals their citations and page counts", () => {
		const runningPage = { url: "https://www.reddit.com/r/running/comments/abc/", title: "Running Tips", count: 5 };
		const anotherRunningPage = { url: "https://old.reddit.com/r/running/comments/def/", count: 3 };
		const cookingPage = { url: "https://www.reddit.com/r/cooking/comments/ghi/", count: 2 };

		expect(summarizeSubreddits([runningPage, cookingPage, anotherRunningPage])).toEqual([
			{
				name: "r/running",
				count: 8,
				newPages: 0,
				totalPages: 2,
				allNew: false,
				hasDropped: false,
				urls: [runningPage, anotherRunningPage],
			},
			{
				name: "r/cooking",
				count: 2,
				newPages: 0,
				totalPages: 1,
				allNew: false,
				hasDropped: false,
				urls: [cookingPage],
			},
		]);
	});

	it("skips pages whose URLs do not belong to a subreddit", () => {
		const page = { url: "https://www.reddit.com/r/running/comments/abc/", count: 2 };

		expect(
			summarizeSubreddits([
				{ url: "https://www.reddit.com/user/someone", count: 20, isNew: true },
				{ url: "https://example.com/r/cooking/", count: 30 },
				page,
			]),
		).toEqual(summarizeSubreddits([page]));
	});

	it("counts new pages and marks a subreddit all new only when every page is new", () => {
		const summaries = summarizeSubreddits([
			{ url: "https://www.reddit.com/r/running/comments/abc/", count: 5, isNew: true },
			{ url: "https://www.reddit.com/r/running/comments/def/", count: 3, isNew: false },
			{ url: "https://www.reddit.com/r/running/comments/ghi/", count: 1 },
			{ url: "https://www.reddit.com/r/cooking/comments/jkl/", count: 2, isNew: true },
			{ url: "https://www.reddit.com/r/cooking/comments/mno/", count: 1, isNew: true },
			{ url: "https://www.reddit.com/r/gardening/comments/pqr/", count: 1, isNew: false },
		]);

		expect(summaries).toMatchObject([
			{ name: "r/running", newPages: 1, totalPages: 3, allNew: false },
			{ name: "r/cooking", newPages: 2, totalPages: 2, allNew: true },
			{ name: "r/gardening", newPages: 0, totalPages: 1, allNew: false },
		]);
	});

	it("marks only subreddits with dropped URLs, including drops from a different page", () => {
		const summaries = summarizeSubreddits(
			[
				{ url: "https://www.reddit.com/r/running/comments/abc/", count: 3 },
				{ url: "https://www.reddit.com/r/cooking/comments/def/", count: 2 },
			],
			[
				"https://old.reddit.com/r/running/comments/dropped/",
				"https://www.reddit.com/r/gardening/comments/dropped/",
				"https://www.reddit.com/user/someone",
				"https://example.com/r/cooking/",
			],
		);

		expect(summaries).toMatchObject([
			{ name: "r/running", count: 3, totalPages: 1, hasDropped: true },
			{ name: "r/cooking", count: 2, totalPages: 1, hasDropped: false },
		]);
	});

	it("orders subreddits by total citations and their pages by individual citations, highest first", () => {
		const summaries = summarizeSubreddits([
			{ url: "https://www.reddit.com/r/cooking/comments/abc/", count: 4 },
			{ url: "https://www.reddit.com/r/running/comments/def/", count: 2 },
			{ url: "https://www.reddit.com/r/gardening/comments/ghi/", count: 8 },
			{ url: "https://www.reddit.com/r/running/comments/jkl/", count: 7 },
			{ url: "https://www.reddit.com/r/running/comments/mno/", count: 3 },
		]);

		expect(summaries.map(({ name, count }) => ({ name, count }))).toEqual([
			{ name: "r/running", count: 12 },
			{ name: "r/gardening", count: 8 },
			{ name: "r/cooking", count: 4 },
		]);
		expect(summaries[0].urls.map(({ count }) => count)).toEqual([7, 3, 2]);
	});

	it("lists only the 20 most cited pages while counting every page and its new status", () => {
		const pages = Array.from({ length: 21 }, (_, index) => ({
			url: `https://www.reddit.com/r/running/comments/page${index}/`,
			count: index + 1,
			isNew: index !== 0,
		}));
		const summaries = summarizeSubreddits(pages);

		expect(summaries).toHaveLength(1);
		expect(summaries[0]).toMatchObject({
			name: "r/running",
			count: 231,
			totalPages: 21,
			newPages: 20,
			allNew: false,
		});
		expect(summaries[0].urls).toEqual(pages.slice(1).reverse());
	});

	it("returns only the 100 most cited subreddits", () => {
		const pages = Array.from({ length: 101 }, (_, index) => ({
			url: `https://www.reddit.com/r/community${index}/comments/abc/`,
			count: index + 1,
		}));
		const summaries = summarizeSubreddits(pages);

		expect(summaries).toHaveLength(100);
		expect(summaries.map(({ name, count }) => ({ name, count }))).toEqual(
			pages
				.slice(1)
				.reverse()
				.map(({ count }) => ({ name: `r/community${count - 1}`, count })),
		);
	});
});
