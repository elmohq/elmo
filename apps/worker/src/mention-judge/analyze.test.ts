import type { MentionConfig } from "@workspace/lib/mentions";
import { describe, expect, it } from "vitest";
import { judgeAnalyzer } from "./analyze";
import type { Judgment, MentionJudge } from "./judge";

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
		const brand = result.mentionAssessments?.brand;
		expect(brand).toMatchObject({ mention: "mentioned", sentiment: "positive" });
		expect(text.slice(brand?.evidence?.start, brand?.evidence?.end)).toContain("Apple is great value.");
	});

	it("doesn't count the name used in another sense", async () => {
		const result = await analyzer.analyze("Eat an apple a day; fruit keeps you healthy.", config);
		expect(result.brandMentioned).toBe(false);
		expect(result.mentionAssessments?.brand).toMatchObject({ mention: "not_mentioned", reason: "other_meaning" });
	});

	it("ignores the name inside a longer word without asking the judge", async () => {
		const result = await analyzer.analyze("Pineapples and Applebee's are popular.", config);
		expect(result.brandMentioned).toBe(false);
		expect(result.mentionAssessments?.brand).toBeUndefined();
	});

	it("counts a brand cited only through a link to its site", async () => {
		const result = await analyzer.analyze("See the [spec sheet](https://apple.com/macbook) for details.", config);
		expect(result.brandMentioned).toBe(true);
	});

	it("doesn't count an answer that says it knows nothing about the brand, even when it links to it", async () => {
		const text = "I have no information about Apple's warranty terms. Check https://apple.com/support for details.";
		const result = await analyzer.analyze(text, config);
		expect(result.brandMentioned).toBe(false);
		expect(result.mentionAssessments?.brand).toMatchObject({ mention: "not_mentioned", reason: "no_info" });
	});

	it("counts a mention the judge is unsure of, and flags it", async () => {
		const result = await analyzer.analyze("Perhaps Apple fits here.", config);
		expect(result.brandMentioned).toBe(true);
		expect(result.mentionAssessments?.brand?.mention).toBe("uncertain");
	});

	it("counts a mention anywhere in a long answer, not just the first match", async () => {
		const filler = "Other options exist. ".repeat(200);
		const text = `An apple is a fruit. ${filler}Apple is the pick for terrible-weather durability.`;
		const result = await analyzer.analyze(text, config);
		expect(result.brandMentioned).toBe(true);
		expect(result.mentionAssessments?.brand?.sentiment).toBe("negative");
	});

	it("judges competitors by their names and aliases", async () => {
		const result = await analyzer.analyze("Globex Corp is a solid alternative.", config);
		expect(result.competitorsMentioned).toEqual(["Globex"]);
		expect(result.mentionAssessments?.competitors?.Globex?.mention).toBe("mentioned");
	});
});
