import type { MentionConfig } from "@workspace/lib/mentions";
import { describe, expect, it, vi } from "vitest";
import { cuedAnalyzer as analyzer } from "./__fixtures__/cued-judge";
import { configureMentionAnalyzer, jevAnalyzer } from "./analyze";
import { type JevRequest, stubTransport } from "./jev";

const config: MentionConfig = {
	brand: { name: "Apple", aliases: [], domains: ["https://www.apple.com"] },
	competitors: [
		{ name: "Globex", aliases: ["Globex Corp"], domains: ["globex.io"] },
		{ name: "Initech", aliases: [], domains: [] },
	],
};

function recording() {
	const requests: JevRequest[] = [];
	const analyze = jevAnalyzer(async (request) => {
		requests.push(request);
		return stubTransport(request);
	});
	return { requests, analyze };
}

describe("judged mentions", () => {
	it("counts a company the answer talks about, with its sentiment and the passage that shows it", async () => {
		const text = "Apple is great value. Globex is a solid alternative.";
		const result = await analyzer.analyze(text, config);
		expect(result.brandMentioned).toBe(true);
		expect(result.competitorsMentioned).toEqual(["Globex"]);
		const brand = result.assessments?.brand;
		expect(brand).toMatchObject({ mentioned: true, sentiment: "positive", position: 1, mentionCount: 1 });
		expect(text.slice(brand?.passage?.start, brand?.passage?.end)).toBe("Apple is great value.");
		expect(result.assessments?.competitors.Globex).toMatchObject({
			mentioned: true,
			sentiment: "neutral",
			position: 2,
		});
	});

	it("doesn't count a name used in another sense, and says why", async () => {
		const result = await analyzer.analyze("An apple is a fruit.", config);
		expect(result.brandMentioned).toBe(false);
		expect(result.assessments?.brand).toMatchObject({ mentioned: false, reason: "other_meaning" });
	});

	it("doesn't count an answer that says it knows nothing about the company", async () => {
		const result = await analyzer.analyze("I have no information about Apple.", config);
		expect(result.assessments?.brand).toMatchObject({ mentioned: false, reason: "no_info" });
	});

	it("counts a mention the judge can't rule out", async () => {
		expect((await analyzer.analyze("Perhaps Apple fits here.", config)).brandMentioned).toBe(true);
	});

	it("counts a company cited only by its site", async () => {
		const result = await analyzer.analyze(
			"Sources: ![](https://www.google.com/s2/favicons?domain=apple.com) +1",
			config,
		);
		expect(result.brandMentioned).toBe(true);
	});

	it("asks nothing, and calls no one, when the answer names no tracked company", async () => {
		const { requests, analyze } = recording();
		const result = await analyze.analyze("Nothing relevant here.", config);
		expect(requests).toEqual([]);
		expect(result).toMatchObject({ brandMentioned: false, competitorsMentioned: [] });
	});

	it("sends the cleaned answer and the question it replies to, asking only about the companies it names", async () => {
		const { requests, analyze } = recording();
		await analyze.analyze("![logo](https://img.example/a.png) Apple is great.", config, null, "best laptops?");
		expect(requests[0].state).toMatchObject({ question: "best laptops?", answer: "(image: logo) Apple is great." });
		expect(Object.keys(requests[0].questions)).toEqual(["brand__verdict", "brand__evidence"]);
	});
});

describe("companies the answer only cites", () => {
	it("counts one it only links to as a mention, with its position, but gives it no sentiment", async () => {
		const result = await analyzer.analyze(
			"Great laptops all round ([apple.com](https://www.apple.com/mac)). Globex is the best alternative.",
			config,
		);
		expect(result.brandMentioned).toBe(true);
		expect(result.assessments?.brand).toMatchObject({ mentioned: true, citedOnly: true, position: 1 });
		expect(result.assessments?.brand?.sentiment).toBeUndefined();
		expect(result.assessments?.brand?.sentimentProbabilities).toBeUndefined();
		expect(result.assessments?.competitors.Globex).toMatchObject({ sentiment: "positive", position: 2 });
	});

	it("gives no sentiment to one cited by a favicon chip and its label", async () => {
		const result = await analyzer.analyze(
			"Great laptops. ![](https://www.google.com/s2/favicons?domain=https://www.apple.com&sz=32) Apple +2",
			config,
		);
		expect(result.assessments?.brand).toMatchObject({ mentioned: true, citedOnly: true });
		expect(result.assessments?.brand?.sentiment).toBeUndefined();
	});

	it("keeps the sentiment of one it names as well as links to, or names by its domain", async () => {
		for (const text of [
			"[Apple](https://www.apple.com) is great value ([apple.com](https://www.apple.com/mac)).",
			"Buy at apple.com, great value.",
		]) {
			const brand = (await analyzer.analyze(text, config)).assessments?.brand;
			expect(brand).toMatchObject({ mentioned: true, sentiment: "positive" });
			expect(brand?.citedOnly).toBeUndefined();
		}
	});

	it("drops the sentiment of one judged before, calling no one", async () => {
		const text = "Great laptops all round ([apple.com](https://www.apple.com/mac)).";
		const first = await analyzer.analyze(text, config);
		const { citedOnly: _, ...brand } = first.assessments!.brand!;
		const judgedBefore = { ...first.assessments!, brand: { ...brand, sentiment: "neutral" as const } };
		const { requests, analyze } = recording();
		const replayed = await analyze.analyze(text, config, judgedBefore);
		expect(requests).toEqual([]);
		expect(replayed.brandMentioned).toBe(true);
		expect(replayed.assessments?.brand).toMatchObject({ citedOnly: true, position: 1 });
		expect(replayed.assessments?.brand?.sentiment).toBeUndefined();
	});

	it("asks again about one kept as only cited once the answer reads as naming it", async () => {
		const text = "Apple is great value.";
		const first = await analyzer.analyze(text, config);
		const { sentiment: _, sentimentProbabilities: __, ...brand } = first.assessments!.brand!;
		const citedBefore = { ...first.assessments!, brand: { ...brand, citedOnly: true as const } };
		const { requests, analyze } = recording();
		const replayed = await analyze.analyze(text, config, citedBefore);
		expect(Object.keys(requests[0].questions)).toEqual(["brand__verdict", "brand__evidence"]);
		expect(replayed.assessments?.brand).toMatchObject({ sentiment: "positive" });
	});
});

describe("re-judging after a config change", () => {
	const text = "Initech leads the pack. Apple is great value. Globex is a solid alternative.";

	it("asks only about a newly added competitor, and reorders everyone's positions", async () => {
		const withoutInitech = { ...config, competitors: config.competitors.slice(0, 1) };
		const first = await analyzer.analyze(text, withoutInitech);
		const { requests, analyze } = recording();
		const second = await analyze.analyze(text, config, first.assessments);
		expect(Object.keys(requests[0].questions)).toEqual(["c1__verdict", "c1__evidence"]);
		expect(second.assessments?.competitors.Initech?.position).toBe(1);
		expect(second.assessments?.brand?.position).toBe(2);
	});

	it("calls no one when a competitor is removed, or when an added one isn't named", async () => {
		const first = await analyzer.analyze(text, config);
		const { requests, analyze } = recording();
		const removed = await analyze.analyze(
			text,
			{ ...config, competitors: config.competitors.slice(1) },
			first.assessments,
		);
		const unnamed = { ...config, competitors: [...config.competitors, { name: "Hooli", aliases: [], domains: [] }] };
		await analyze.analyze(text, unnamed, first.assessments);
		expect(requests).toEqual([]);
		expect(removed.competitorsMentioned).toEqual(["Initech"]);
	});

	it("re-judges a company whose names changed, and only that one", async () => {
		const first = await analyzer.analyze(text, config);
		const { requests, analyze } = recording();
		const renamed = { ...config, brand: { ...config.brand, aliases: ["Apple Inc"] } };
		await analyze.analyze(text, renamed, first.assessments);
		expect(Object.keys(requests[0].questions)).toEqual(["brand__verdict", "brand__evidence"]);
	});

	it("asks about a company it has no judgement for, even under an unchanged fingerprint", async () => {
		const first = await analyzer.analyze(text, config);
		const { brand: _, ...withoutBrand } = first.assessments!;
		const { requests, analyze } = recording();
		const second = await analyze.analyze(text, config, withoutBrand);
		expect(Object.keys(requests[0].questions)).toEqual(["brand__verdict", "brand__evidence"]);
		expect(second.brandMentioned).toBe(true);
	});

	it("re-judges everything when the request or model changes", async () => {
		const first = await analyzer.analyze(text, config);
		const stale = { ...first.assessments!, judged: { brand: "old", competitors: { Globex: "old", Initech: "old" } } };
		const { requests, analyze } = recording();
		await analyze.analyze(text, config, stale);
		expect(Object.keys(requests[0].questions)).toHaveLength(6);
	});
});

describe("configureMentionAnalyzer", () => {
	it("refuses to run without a key", () => {
		expect(() => configureMentionAnalyzer("")).toThrow("TYPESAFE_API_KEY");
	});

	it("stamps the stub's judgements apart from Jev's, so a real key re-judges them", () => {
		expect(configureMentionAnalyzer("stub").judgeVersion).not.toBe(configureMentionAnalyzer("key").judgeVersion);
	});

	it("judges locally with the stub key, calling no one", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const stub = configureMentionAnalyzer("stub");
		expect((await stub.analyze("Apple is great.", config)).brandMentioned).toBe(true);
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});
});
