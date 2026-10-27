import { describe, expect, it } from "vitest";
import { AI_CRAWLERS } from "./robots";
import { computeScore } from "./score";
import type { SiteSignals } from "./types";

function site(overrides: Partial<SiteSignals> = {}, blocked: string[] = []): SiteSignals {
	return {
		homepageReachable: true,
		title: "",
		description: "",
		structuredDataTypes: ["Organization"],
		robotsTxt: "found",
		llmsTxt: true,
		crawlers: AI_CRAWLERS.map((crawler) => ({
			...crawler,
			access: blocked.includes(crawler.token) ? ("blocked" as const) : ("allowed" as const),
		})),
		...overrides,
	};
}

const top = { mentioned: true, position: 1, cited: true };
const absent = { mentioned: false, position: null, cited: false };

describe("computeScore", () => {
	it("gives 100 to a site named first and cited in every answer with nothing blocked", () => {
		expect(computeScore([top, top, top, top, top], site()).total).toBe(100);
	});

	it("gives 0 to a site AI never mentions that blocks every crawler and has no on-site signals", () => {
		const signals = site(
			{ structuredDataTypes: [], llmsTxt: false },
			AI_CRAWLERS.map((crawler) => crawler.token),
		);
		expect(computeScore([absent, absent, absent], signals).total).toBe(0);
	});

	it("scales with the share of answers that mention the brand", () => {
		const some = computeScore([top, absent, absent, absent, absent], site()).total;
		const more = computeScore([top, top, top, absent, absent], site()).total;
		expect(more).toBeGreaterThan(some);
	});

	it("rewards being named earlier", () => {
		const first = computeScore([{ ...top, cited: false }], site()).total;
		const fourth = computeScore([{ ...top, position: 4, cited: false }], site()).total;
		expect(first).toBeGreaterThan(fourth);
	});

	it("penalizes blocking search crawlers more than training crawlers", () => {
		const blocksSearch = computeScore([absent], site({}, ["OAI-SearchBot"])).total;
		const blocksTraining = computeScore([absent], site({}, ["GPTBot"])).total;
		expect(blocksTraining).toBeGreaterThan(blocksSearch);
	});

	it("doesn't count failed answers against the brand", () => {
		const withFailure = computeScore([top, { ...absent, failed: true }], site()).total;
		expect(withFailure).toBe(100);
	});

	it("doesn't penalize a robots.txt it couldn't read", () => {
		const unreadable = site({
			robotsTxt: "unreachable",
			crawlers: AI_CRAWLERS.map((crawler) => ({ ...crawler, access: "unknown" as const })),
		});
		expect(computeScore([top], unreadable).total).toBe(100);
	});

	it("explains every point in the breakdown", () => {
		const { total, items } = computeScore([top, absent], site());
		expect(items.reduce((sum, item) => sum + item.max, 0)).toBe(100);
		expect(Math.round(items.reduce((sum, item) => sum + item.points, 0))).toBe(total);
	});
});
