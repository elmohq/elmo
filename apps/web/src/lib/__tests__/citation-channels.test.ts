import { describe, expect, it } from "vitest";
import { buildChannelMix, type ChannelRows } from "@/lib/citation-channels";

const brand = { name: "Acme", domains: ["acme.example"] };
const competitors = [
	{ id: "rival", name: "Rival Co", domains: ["rival.example"] },
	{ id: "quiet", name: "Quiet", domains: ["quiet.example"] },
];

type Source = {
	url: string;
	count: number;
	category?: string;
	/** Citations from answers mentioning the brand, then each competitor by name. */
	brand?: number;
	mentions?: Record<string, number>;
};

function mix(sources: Source[]) {
	const rows: ChannelRows = { domains: [], competitors: [], pages: [] };
	for (const source of sources) {
		const row = {
			domain: new URL(source.url).hostname.replace(/^www\./, ""),
			static_category: (source.category ?? "other") as ChannelRows["domains"][number]["static_category"],
			count: source.count,
		};
		rows.domains.push({ ...row, brand_count: source.brand ?? 0 });
		for (const [competitor_name, count] of Object.entries(source.mentions ?? {})) {
			rows.competitors.push({ ...row, competitor_name, count });
		}
		rows.pages.push({
			...row,
			brand_count: source.brand ?? 0,
			url: source.url,
			title: null,
			competitors: source.mentions ?? {},
		});
	}
	const result = buildChannelMix({ rows, brand, competitors });
	return { ...result, channel: (key: string) => result.channels.find((c) => c.key === key) };
}

describe("channel mix", () => {
	it("credits a channel's citations to the companies the citing answers mention", () => {
		const { channel } = mix([
			{
				url: "https://www.youtube.com/watch?v=1",
				count: 10,
				category: "social",
				brand: 2,
				mentions: { "Rival Co": 7 },
			},
			{ url: "https://youtu.be/2", count: 5, category: "social", mentions: { "Rival Co": 1 } },
		]);
		expect(channel("youtube")?.citations).toBe(15);
		expect(channel("youtube")?.bySubject).toEqual({ brand: 2, rival: 8 });
	});

	it("credits Own Website by whose domain is cited, subdomains included, not by who is mentioned", () => {
		const { channel } = mix([
			{ url: "https://docs.acme.example/start", count: 5, mentions: { "Rival Co": 5 } },
			{ url: "https://rival.example/pricing", count: 3, brand: 3 },
		]);
		expect(channel("owned")?.citations).toBe(8);
		expect(channel("owned")?.bySubject).toEqual({ brand: 5, rival: 3 });
	});

	it("reports each company's mentions across every channel as the baseline", () => {
		const { overall, totalCitations } = mix([
			{ url: "https://www.reddit.com/r/sales/1", count: 4, category: "social", brand: 1, mentions: { "Rival Co": 4 } },
			{ url: "https://rival.example/", count: 6, brand: 2, mentions: { "Rival Co": 6 } },
		]);
		expect(totalCitations).toBe(10);
		expect(overall).toEqual({ brand: 3, rival: 10 });
	});

	it("lists a channel's most cited pages with the companies their answers mention", () => {
		const { channel } = mix([
			{ url: "https://www.reddit.com/r/sales/1", count: 2, category: "social", brand: 1 },
			{ url: "https://www.reddit.com/r/sales/2", count: 9, category: "social", mentions: { "Rival Co": 4 } },
		]);
		expect(channel("reddit")?.topPages.map(({ url, count, bySubject }) => ({ url, count, bySubject }))).toEqual([
			{ url: "https://www.reddit.com/r/sales/2", count: 9, bySubject: { rival: 4 } },
			{ url: "https://www.reddit.com/r/sales/1", count: 2, bySubject: { brand: 1 } },
		]);
	});

	it("groups sources outside the named platforms by their source category", () => {
		const { channels } = mix([
			{ url: "https://news.example/story", count: 4, category: "editorial" },
			{ url: "https://forum.example/t/1", count: 2, category: "social" },
		]);
		expect(channels.map((c) => [c.label, c.citations])).toEqual([
			["Editorial", 4],
			["Forums & Communities", 2],
		]);
	});

	it("lists the brand first, then only competitors that are mentioned, most mentioned first", () => {
		const { subjects } = mix([{ url: "https://news.example/a", count: 9, mentions: { "Rival Co": 3 } }]);
		expect(subjects.map((s) => s.id)).toEqual(["brand", "rival"]);
	});

	it("keeps the 10 most cited channels", () => {
		const hosts = [
			"youtube.com",
			"reddit.com",
			"linkedin.com",
			"x.com",
			"tiktok.com",
			"instagram.com",
			"facebook.com",
			"pinterest.com",
			"quora.com",
			"medium.com",
			"substack.com",
		];
		const { channels } = mix(hosts.map((host, i) => ({ url: `https://${host}/p`, count: 20 - i, category: "social" })));
		expect(channels).toHaveLength(10);
		expect(channels.map((c) => c.key)).not.toContain("substack");
	});
});
