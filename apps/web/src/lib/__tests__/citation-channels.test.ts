import { describe, expect, it } from "vitest";
import { buildChannelMix, type ChannelPageRow, channelSearchTerms } from "@/lib/citation-channels";

const brand = { name: "Acme", aliases: ["Acme CRM"], domains: ["acme.example"] };
const competitors = [
	{ id: "rival", name: "Rival Co", aliases: [], domains: ["rival.example"] },
	{ id: "quiet", name: "Quiet", aliases: [], domains: ["quiet.example"] },
];

const page = (url: string, title: string | null, count: number, static_category = "other"): ChannelPageRow => ({
	url,
	domain: new URL(url).hostname.replace(/^www\./, ""),
	title,
	count,
	static_category: static_category as ChannelPageRow["static_category"],
});

function mix(pages: ChannelPageRow[]) {
	const result = buildChannelMix({ domains: pages, pages, brand, competitors });
	const channel = (key: string) => result.channels.find((c) => c.key === key);
	return { ...result, channel };
}

describe("channel mix", () => {
	it("credits a company's own domains, subdomains included, to its Own Website channel", () => {
		const { channel } = mix([
			page("https://docs.acme.example/start", "Getting started", 5),
			page("https://rival.example/pricing", "Pricing", 3),
		]);
		expect(channel("owned")?.citations).toBe(8);
		expect(channel("owned")?.bySubject.brand.citations).toBe(5);
		expect(channel("owned")?.bySubject.rival.citations).toBe(3);
	});

	it("credits a third-party page to the company its title names", () => {
		const { channel } = mix([
			page("https://www.youtube.com/watch?v=1", "Rival Co setup in 60 seconds", 7, "social"),
			page("https://www.youtube.com/watch?v=2", "Ten sales tips", 4, "social"),
		]);
		expect(channel("youtube")?.citations).toBe(11);
		expect(channel("youtube")?.bySubject).toEqual({ rival: { citations: 7, pages: 1 } });
	});

	it("credits a page to the company whose handle or slug is in its URL", () => {
		const { channel } = mix([
			page("https://www.youtube.com/@rivalco/videos", null, 2, "social"),
			page("https://www.linkedin.com/company/acme-crm", null, 3, "social"),
		]);
		expect(channel("youtube")?.bySubject.rival.citations).toBe(2);
		expect(channel("linkedin")?.bySubject.brand.citations).toBe(3);
	});

	it("credits a comparison page to every company it names", () => {
		const { channel } = mix([page("https://reviews.example/acme-vs-rival-co", "Acme vs Rival Co", 6, "reviews")]);
		expect(channel("reviews")?.bySubject).toEqual({
			brand: { citations: 6, pages: 1 },
			rival: { citations: 6, pages: 1 },
		});
		expect(channel("reviews")?.topPages[0].subjectIds).toEqual(["brand", "rival"]);
	});

	it("does not match a name inside a longer word", () => {
		const { channel } = mix([
			page("https://www.reddit.com/r/sales/comments/1", "Acmeister pharmacy deals", 4, "social"),
		]);
		expect(channel("reddit")?.bySubject).toEqual({});
	});

	it("groups sources outside the named platforms by their source category", () => {
		const { channels } = mix([
			page("https://news.example/story", "Sales news", 4, "editorial"),
			page("https://forum.example/t/1", "Thread", 2, "social"),
		]);
		expect(channels.map((c) => [c.label, c.citations])).toEqual([
			["Editorial", 4],
			["Forums & Communities", 2],
		]);
	});

	it("lists the brand first, then only competitors that show up, most present first", () => {
		const { subjects } = mix([page("https://rival.example/", "Rival Co", 9)]);
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
		const { channels } = mix(hosts.map((host, i) => page(`https://${host}/p`, null, 20 - i, "social")));
		expect(channels).toHaveLength(10);
		expect(channels.map((c) => c.key)).not.toContain("substack");
	});

	it("narrows the pages to read by the longest unbroken run of each name", () => {
		expect(channelSearchTerms([{ id: "brand", ...brand }, ...competitors]).sort()).toEqual(["acme", "quiet", "rival"]);
	});
});
