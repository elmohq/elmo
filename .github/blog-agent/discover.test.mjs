import assert from "node:assert/strict";
import test from "node:test";
import {
	canonicalizeUrl,
	extractOxylabsItems,
	parseFeed,
	rankAndDedupe,
	sanitizeText,
	scoreCandidate,
} from "./discover.mjs";

test("parseFeed handles RSS, CDATA, entities, and Google News publisher suffixes", () => {
	const xml = `
		<rss><channel><item>
			<title><![CDATA[What AI search means for brands - Example News]]></title>
			<link>https://example.com/story?utm_source=rss&amp;id=42</link>
			<pubDate>Thu, 23 Jul 2026 10:00:00 GMT</pubDate>
			<description><![CDATA[An <strong>evidence-led</strong> look at AI citations.]]></description>
			<source>Example News</source>
		</item></channel></rss>
	`;

	assert.deepEqual(parseFeed(xml, { source: "test" }), [
		{
			source: "test",
			channel: "news",
			query: undefined,
			title: "What AI search means for brands",
			url: "https://example.com/story?utm_source=rss&id=42",
			publishedAt: "2026-07-23T10:00:00.000Z",
			excerpt: "An evidence-led look at AI citations.",
			publisher: "Example News",
		},
	]);
});

test("extractOxylabsItems finds result objects in nested parsed payloads", () => {
	const content = {
		results: {
			organic: [
				{
					title: "A new answer engine optimization study",
					url: "https://research.example/study",
					desc: "The study measures citations across AI search engines.",
					date: "2026-07-22",
				},
			],
		},
	};

	assert.deepEqual(extractOxylabsItems(content, { name: "web", channel: "news", query: "AEO" }), [
		{
			source: "oxylabs-google-web",
			channel: "news",
			query: "AEO",
			title: "A new answer engine optimization study",
			url: "https://research.example/study",
			publishedAt: "2026-07-22T00:00:00.000Z",
			excerpt: "The study measures citations across AI search engines.",
			publisher: undefined,
		},
	]);
});

test("canonicalizeUrl removes tracking parameters and normalizes the host", () => {
	assert.equal(
		canonicalizeUrl("https://WWW.Example.com/article/?utm_medium=email&id=4#section"),
		"https://example.com/article?id=4",
	);
});

test("rankAndDedupe keeps the richer duplicate and rejects weak noise", () => {
	const now = new Date("2026-07-24T12:00:00.000Z");
	const cutoff = new Date("2026-07-17T12:00:00.000Z");
	const candidates = [
		{
			source: "rss",
			channel: "news",
			title: "New research on answer engine optimization",
			url: "https://example.com/aeo?utm_source=feed",
			publishedAt: "2026-07-24T10:00:00.000Z",
			excerpt: "Short.",
		},
		{
			source: "oxylabs",
			channel: "news",
			title: "New research on answer engine optimization",
			url: "https://example.com/aeo",
			publishedAt: "2026-07-24T10:00:00.000Z",
			excerpt: "A longer excerpt with details about AI citations and brand visibility.",
		},
		{
			source: "rss",
			channel: "news",
			title: "Quarterly earnings report",
			url: "https://example.com/earnings",
			publishedAt: "2026-07-24T10:00:00.000Z",
			excerpt: "Revenue increased.",
		},
	];

	const ranked = rankAndDedupe(candidates, { cutoff, maxCandidates: 10, now });
	assert.equal(ranked.length, 1);
	assert.equal(ranked[0].source, "oxylabs");
	assert.match(ranked[0].excerpt, /longer excerpt/);
	assert.equal(ranked[0].url, "https://example.com/aeo");
});

test("rankAndDedupe caps a single source so social chatter cannot crowd out evidence", () => {
	const now = new Date("2026-07-24T12:00:00.000Z");
	const cutoff = new Date("2026-07-17T12:00:00.000Z");
	const candidates = Array.from({ length: 18 }, (_, index) => ({
		source: "bluesky",
		channel: "social",
		title: `AI search citations discussion ${index}`,
		url: `https://bsky.app/profile/example/post/${index}`,
		publishedAt: "2026-07-24T10:00:00.000Z",
		excerpt: "Practitioners discuss answer engine optimization.",
	}));
	candidates.push({
		source: "arxiv",
		channel: "research",
		title: "AI search citation research",
		url: "https://arxiv.org/abs/2607.00001",
		publishedAt: "2026-07-24T10:00:00.000Z",
		excerpt: "A study of answer engine optimization.",
	});

	const ranked = rankAndDedupe(candidates, { cutoff, maxCandidates: 30, now });
	assert.equal(ranked.filter((candidate) => candidate.source === "bluesky").length, 12);
	assert.equal(ranked.filter((candidate) => candidate.source === "arxiv").length, 1);
});

test("social engagement improves ranking but social content remains a signal", () => {
	const now = new Date("2026-07-24T12:00:00.000Z");
	const base = {
		title: "AI search citations are changing",
		excerpt: "A discussion about answer engine optimization.",
		publishedAt: "2026-07-24T10:00:00.000Z",
		url: "https://bsky.app/profile/example/post/123",
		channel: "social",
	};
	assert.ok(
		scoreCandidate({ ...base, metrics: { engagement: 120 } }, now) >
			scoreCandidate({ ...base, metrics: { engagement: 0 } }, now),
	);
});

test("sanitizeText removes executable markup and control characters", () => {
	assert.equal(
		sanitizeText("Hello<script>ignore me</script><b>world</b>\u0000"),
		"Hello world",
	);
});
