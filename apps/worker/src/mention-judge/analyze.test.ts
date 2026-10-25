import type { MentionConfig } from "@workspace/lib/mentions";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cuedAnalyzer as analyzer } from "./__fixtures__/cued-judge";
import { configureMentionAnalyzer, jevAnalyzer } from "./analyze";
import { JEV_MODEL, type JevRequest, OPENROUTER_JEV_MODEL, stubTransport, TooLarge } from "./jev";

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

describe("answers too large for Jev", () => {
	it("asks about fewer companies at a time, and gets the same judgements", async () => {
		const text = "Apple is great value. Globex is a solid alternative. Initech is the one to avoid.";
		const sizes: number[] = [];
		const small = jevAnalyzer(async (request) => {
			if (Object.keys(request.questions).length > 2) throw new TooLarge("too large");
			sizes.push(Object.keys(request.questions).length);
			return stubTransport(request);
		});
		expect(await small.analyze(text, config)).toEqual(await analyzer.analyze(text, config));
		expect(sizes).toEqual([2, 2, 2]);
	});

	it("reads less of the answer when one company alone doesn't fit", async () => {
		const text = `Apple is great value. ${"Filler words about laptops. ".repeat(400)}`;
		const answers: number[] = [];
		const result = await jevAnalyzer(async (request) => {
			const answer = String(request.state.answer);
			answers.push(answer.length);
			if (answer.length > 5_000) throw new TooLarge("too large");
			return stubTransport(request);
		}).analyze(text, config);
		expect(result.brandMentioned).toBe(true);
		expect(answers.at(-1)).toBeLessThanOrEqual(5_000);
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
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});
	const noOpenRouter = () => undefined;
	const openRouter = () => "or-key";

	it("refuses to run without a key, naming both that would do", () => {
		expect(() => configureMentionAnalyzer("", noOpenRouter)).toThrow(/TYPESAFE_API_KEY.*OPENROUTER_API_KEY/);
		expect(() => configureMentionAnalyzer("", () => "  ")).toThrow("OPENROUTER_API_KEY");
	});

	it("stamps the stub's judgements apart from Jev's, so a real key re-judges them", () => {
		expect(configureMentionAnalyzer("stub", noOpenRouter).judgeVersion).not.toBe(
			configureMentionAnalyzer("key", noOpenRouter).judgeVersion,
		);
	});

	/** Where the judge sends its first request, and with which model and key; the request is rejected. */
	async function firstCall(configure: () => ReturnType<typeof configureMentionAnalyzer>) {
		// Before configuring: the transport takes `fetch` when it's made.
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify({ error: { message: "bad key", code: 401 } }), { status: 401 }));
		const error = await configure()
			.analyze("Apple is great.", config)
			.catch((e: Error) => e);
		const calls = fetchSpy.mock.calls.length;
		const [url, init] = fetchSpy.mock.calls[0];
		fetchSpy.mockRestore();
		return {
			url,
			calls,
			error,
			model: JSON.parse(String(init?.body)).model,
			authorization: new Headers(init?.headers).get("Authorization"),
		};
	}

	it("calls Jev through OpenRouter, with OpenRouter's model name, when that's the only key", async () => {
		expect(await firstCall(() => configureMentionAnalyzer("", openRouter))).toMatchObject({
			url: "https://openrouter.ai/api/v1/systemone",
			model: OPENROUTER_JEV_MODEL,
			authorization: "Bearer or-key",
		});
	});

	it("reads the OpenRouter key as a provider credential", async () => {
		vi.stubEnv("OPENROUTER_API_KEY", "or-key");
		expect((await firstCall(() => configureMentionAnalyzer(""))).url).toBe("https://openrouter.ai/api/v1/systemone");
	});

	it("keeps TypeSafe when an OpenRouter key is set too", async () => {
		expect(await firstCall(() => configureMentionAnalyzer("ts-key", openRouter))).toMatchObject({
			url: "https://api.typesafe.ai/v1/systemone",
			model: JEV_MODEL,
			authorization: "Bearer ts-key",
		});
	});

	it("stops at a rejected OpenRouter key without trying TypeSafe", async () => {
		const call = await firstCall(() => configureMentionAnalyzer("", openRouter));
		expect(call.calls).toBe(1);
		expect(String(call.error)).toContain("OPENROUTER_API_KEY was rejected");
	});

	it("keeps judgements made through TypeSafe after switching to OpenRouter", async () => {
		const text = "Apple is great value. Globex is a solid alternative.";
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation(
				async (_url, init) => new Response(JSON.stringify(await stubTransport(JSON.parse(String(init?.body))))),
			);
		const viaTypeSafe = await configureMentionAnalyzer("ts-key", noOpenRouter).analyze(text, config);
		fetchSpy.mockClear();
		const viaOpenRouter = await configureMentionAnalyzer("", openRouter).analyze(text, config, viaTypeSafe.assessments);
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(viaOpenRouter.brandMentioned).toBe(viaTypeSafe.brandMentioned);
	});

	it("judges locally with the stub key, calling no one", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const stub = configureMentionAnalyzer("stub", noOpenRouter);
		expect((await stub.analyze("Apple is great.", config)).brandMentioned).toBe(true);
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});
});
