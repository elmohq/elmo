/** Exact-host check, so lookalikes such as "notreddit.com" or "reddit.com.evil.net" don't count. */
export const isRedditDomain = (domain: string) => domain === "reddit.com" || domain.endsWith(".reddit.com");

export const extractSubreddit = (url: string): string | null => {
	const match = url.match(/reddit\.com\/r\/([^/?#]+)/i);
	return match ? `r/${match[1]}` : null;
};

export interface SubredditPage {
	url: string;
	title?: string;
	count: number;
	isNew?: boolean;
}

export interface Subreddit {
	name: string;
	count: number;
	newPages: number;
	totalPages: number;
	allNew: boolean;
	hasDropped: boolean;
	urls: SubredditPage[];
}

const MAX_SUBREDDITS = 100;
const MAX_URLS_PER_SUBREDDIT = 20;

/** Each subreddit lists only its most cited pages; its counts still cover all of them. */
export function summarizeSubreddits(pages: SubredditPage[], droppedUrls: string[] = []): Subreddit[] {
	const dropped = new Set(droppedUrls.map(extractSubreddit).filter(Boolean));
	const bySubreddit = new Map<string, Omit<Subreddit, "name" | "allNew" | "hasDropped">>();
	for (const page of pages) {
		const name = extractSubreddit(page.url);
		if (!name) continue;
		const tally = bySubreddit.get(name) ?? { count: 0, newPages: 0, totalPages: 0, urls: [] };
		tally.count += page.count;
		tally.totalPages += 1;
		if (page.isNew) tally.newPages += 1;
		tally.urls.push(page);
		bySubreddit.set(name, tally);
	}
	return [...bySubreddit.entries()]
		.map(([name, tally]) => ({
			name,
			...tally,
			allNew: tally.newPages === tally.totalPages,
			hasDropped: dropped.has(name),
			urls: tally.urls.sort((a, b) => b.count - a.count).slice(0, MAX_URLS_PER_SUBREDDIT),
		}))
		.sort((a, b) => b.count - a.count)
		.slice(0, MAX_SUBREDDITS);
}
