import type { MentionConfig } from "@workspace/lib/mentions";
import { describe, expect, it } from "vitest";
import { judgeAnalyzer } from "./analyze";
import type { JudgedEntity, Judgment, MentionJudge } from "./judge";

/**
 * Stands in for the model: reads a cue word in the passage and answers with
 * confident probabilities, so these tests pin the policy around the model.
 */
function cuedJudgment(passage: string): Judgment {
	const reference = { brand: 0.02, other_meaning: 0.02, other_company: 0.02, link_only: 0.02, no_info: 0.02 };
	if (/no information/i.test(passage)) reference.no_info = 0.92;
	else if (/fruit/i.test(passage)) reference.other_meaning = 0.92;
	else if (/perhaps/i.test(passage)) Object.assign(reference, { brand: 0.5, other_company: 0.44 });
	else reference.brand = 0.92;
	const sentiment = { positive: 0.05, neutral: 0.05, negative: 0.05, mixed: 0.05 };
	if (/terrible/i.test(passage)) sentiment.negative = 0.85;
	else if (/great/i.test(passage)) sentiment.positive = 0.85;
	else sentiment.neutral = 0.85;
	return { reference, sentiment };
}

const stubJudge: MentionJudge = { version: "test", judge: async (_entity, passage) => cuedJudgment(passage) };
const analyzer = judgeAnalyzer(stubJudge);

const config: MentionConfig = {
	brand: { name: "Apple", aliases: [], domains: ["https://www.apple.com"] },
	competitors: [{ name: "Globex", aliases: ["Globex Corp"], domains: ["globex.io"] }],
};

describe("judged mentions", () => {
	it("counts a brand the answer talks about, with the passage that shows it", async () => {
		const text = "For laptops, Apple is great value. Battery life matters too.";
		const result = await analyzer.analyze(text, config);
		expect(result.brandMentioned).toBe(true);
		const brand = result.assessments?.brand;
		expect(brand).toMatchObject({ mention: "mentioned", sentiment: "positive" });
		expect(text.slice(brand?.evidence?.start, brand?.evidence?.end)).toContain("Apple is great value.");
	});

	it("doesn't count the name used in another sense", async () => {
		const result = await analyzer.analyze("Eat an apple a day; fruit keeps you healthy.", config);
		expect(result.brandMentioned).toBe(false);
		expect(result.assessments?.brand).toMatchObject({ mention: "not_mentioned", reason: "other_meaning" });
	});

	it("ignores the name inside a longer word without asking the judge", async () => {
		const result = await analyzer.analyze("Pineapples and Applebee's are popular.", config);
		expect(result.brandMentioned).toBe(false);
		expect(result.assessments?.brand).toBeUndefined();
	});

	it("counts a brand cited only through a link to its site", async () => {
		const result = await analyzer.analyze("See the [spec sheet](https://apple.com/macbook) for details.", config);
		expect(result.brandMentioned).toBe(true);
	});

	it("doesn't count an answer that says it knows nothing about the brand, even when it links to it", async () => {
		const text = "I have no information about Apple's warranty terms. Check https://apple.com/support for details.";
		const result = await analyzer.analyze(text, config);
		expect(result.brandMentioned).toBe(false);
		expect(result.assessments?.brand).toMatchObject({ mention: "not_mentioned", reason: "no_info" });
	});

	it("counts a mention the judge is unsure of, and flags it", async () => {
		const result = await analyzer.analyze("Perhaps Apple fits here.", config);
		expect(result.brandMentioned).toBe(true);
		expect(result.assessments?.brand?.mention).toBe("uncertain");
	});

	it("counts a mention anywhere in a long answer, not just the first match", async () => {
		const filler = "Other options exist. ".repeat(200);
		const text = `An apple is a fruit. ${filler}Apple is the pick for terrible-weather durability.`;
		const result = await analyzer.analyze(text, config);
		expect(result.brandMentioned).toBe(true);
		expect(result.assessments?.brand?.sentiment).toBe("negative");
	});

	it("finds the brand after text whose lowercase form is a different length", async () => {
		const text = "İstanbul has many shops. Apple is great value there.";
		const result = await analyzer.analyze(text, config);
		expect(result.brandMentioned).toBe(true);
		const evidence = result.assessments?.brand?.evidence;
		expect(text.slice(evidence?.start, evidence?.end)).toContain("Apple is great value there.");
	});

	it("describes the brand to the model without blank aliases or domains", async () => {
		const seen: JudgedEntity[] = [];
		const recording = judgeAnalyzer({
			version: "test",
			judge: async (entity, passage) => {
				seen.push(entity);
				return cuedJudgment(passage);
			},
		});
		const padded = {
			...config,
			brand: { ...config.brand, aliases: ["", "  "], domains: [" ", "https://www.apple.com"] },
		};
		await recording.analyze("Apple is great value.", padded);
		expect(seen[0]).toMatchObject({ aliases: [], domains: ["apple.com"] });
	});

	it("keeps the brand in what the model reads after a long run-on lead-in", async () => {
		const passages: string[] = [];
		const recording = judgeAnalyzer({
			version: "test",
			judge: async (_entity, passage) => {
				passages.push(passage);
				return cuedJudgment(passage);
			},
		});
		const leadIn = "word ".repeat(1000);
		await recording.analyze(`${leadIn}\nApple is great value.`, config);
		const at = passages[0].indexOf("Apple");
		expect(at).toBeGreaterThanOrEqual(0);
		expect(at).toBeLessThan(500);
	});

	it("ranks the companies an answer names by where it first mentions each", async () => {
		const text = "Globex is a solid pick. Apple is great value, and Apple support is quick.";
		const result = await analyzer.analyze(text, config);
		const brand = result.assessments?.brand;
		const globex = result.assessments?.competitors?.Globex;
		expect(globex).toMatchObject({ position: 1, firstMention: 0, mentionCount: 1 });
		expect(brand).toMatchObject({ position: 2, firstMention: text.indexOf("Apple"), mentionCount: 2 });
	});

	it("gives no position to a name the answer uses in another sense", async () => {
		const text =
			"An apple is a fruit. It grows on trees. Many people eat it daily. Globex Corp is a solid alternative.";
		const result = await analyzer.analyze(text, config);
		expect(result.assessments?.brand?.position).toBeUndefined();
		expect(result.assessments?.competitors?.Globex?.position).toBe(1);
	});

	it("judges competitors by their names and aliases", async () => {
		const result = await analyzer.analyze("Globex Corp is a solid alternative.", config);
		expect(result.competitorsMentioned).toEqual(["Globex"]);
		expect(result.assessments?.competitors?.Globex?.mention).toBe("mentioned");
	});
});

describe("re-judging after a config change", () => {
	const text = "Initech leads the pack. Apple is great value. Globex is a solid alternative.";

	function countingJudge(version = "test") {
		const judged: string[] = [];
		const judge: MentionJudge = {
			version,
			judge: async (entity, passage) => {
				judged.push(entity.name);
				return cuedJudgment(passage);
			},
		};
		return { judged, analyzer: judgeAnalyzer(judge) };
	}

	it("judges only a newly added competitor, and reorders everyone's positions", async () => {
		const first = countingJudge();
		const before = await first.analyzer.analyze(text, config);
		expect(before.assessments?.brand?.position).toBe(1);

		const second = countingJudge();
		const withInitech = {
			...config,
			competitors: [...config.competitors, { name: "Initech", aliases: [], domains: [] }],
		};
		const after = await second.analyzer.analyze(text, withInitech, before.assessments);
		expect(new Set(second.judged)).toEqual(new Set(["Initech"]));
		expect(after.assessments?.competitors?.Initech?.position).toBe(1);
		expect(after.assessments?.brand?.position).toBe(2);
		expect(after.assessments?.competitors?.Globex?.position).toBe(3);
	});

	it("re-judges a subject whose names changed, and only that one", async () => {
		const before = await countingJudge().analyzer.analyze(text, config);
		const rejudge = countingJudge();
		const renamed = { ...config, brand: { ...config.brand, aliases: ["Apple Inc"] } };
		await rejudge.analyzer.analyze(text, renamed, before.assessments);
		expect(new Set(rejudge.judged)).toEqual(new Set(["Apple"]));
	});

	it("re-judges a subject whose name was only recased, since the model reads it as written", async () => {
		const before = await countingJudge().analyzer.analyze(text, config);
		const rejudge = countingJudge();
		const recased = { ...config, brand: { ...config.brand, name: "APPLE" } };
		await rejudge.analyzer.analyze(text, recased, before.assessments);
		expect(rejudge.judged).toEqual(["APPLE"]);
	});

	it("re-judges everything under a new judge", async () => {
		const before = await countingJudge("1").analyzer.analyze(text, config);
		const upgraded = countingJudge("2");
		await upgraded.analyzer.analyze(text, config, before.assessments);
		expect(new Set(upgraded.judged)).toEqual(new Set(["Apple", "Globex"]));
	});
});
