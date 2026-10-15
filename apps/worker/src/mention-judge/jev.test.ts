import { describe, expect, it, vi } from "vitest";
import { loadMentionAnalyzer } from "./analyze";
import { jevJudge } from "./jev";

const answer = (reference: Record<string, number>, sentiment: Record<string, number>) =>
	new Response(
		JSON.stringify({ answers: { reference: { probabilities: reference }, sentiment: { probabilities: sentiment } } }),
	);

const brandly = { brand: 0.9, other_meaning: 0.04, other_company: 0.03, link_only: 0.02, no_info: 0.01 };
const upbeat = { positive: 0.8, neutral: 0.1, negative: 0.05, mixed: 0.05 };
const entity = { name: "Acme", aliases: ["Acme Corp"], domains: ["acme.com"], competitors: ["Globex"] };

describe("jevJudge", () => {
	it("asks about the entity in its context and returns Jev's probabilities", async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () => answer(brandly, upbeat));
		const judgment = await jevJudge("key", fetchImpl).judge(entity, "Acme is great.");

		expect(judgment.reference.brand).toBe(0.9);
		expect(judgment.sentiment.positive).toBe(0.8);
		const body = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string);
		expect(body.state).toEqual({
			passage: "Acme is great.",
			tracked_entity: {
				name: "Acme",
				also_known_as: ["Acme Corp"],
				domains: ["acme.com"],
				top_competitors: ["Globex"],
			},
		});
	});

	it("retries when rate limited", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(new Response("slow down", { status: 429 }))
			.mockResolvedValueOnce(answer(brandly, upbeat));
		await expect(jevJudge("key", fetchImpl).judge(entity, "Acme.")).resolves.toBeDefined();
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it("fails rather than guess when the request is rejected", async () => {
		const fetchImpl = vi.fn(async () => new Response("bad key", { status: 401 }));
		await expect(jevJudge("key", fetchImpl).judge(entity, "Acme.")).rejects.toThrow(/401/);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it("rejects answers that aren't a probability over the expected labels", async () => {
		const fetchImpl = vi.fn(async () => answer({ brand: 1 }, upbeat));
		await expect(jevJudge("key", fetchImpl).judge(entity, "Acme.")).rejects.toThrow(/unexpected probabilities/);
	});
});

describe("loadMentionAnalyzer", () => {
	it("judges with Jev when its key is set, even with the bundled model available", async () => {
		const analyzer = await loadMentionAnalyzer({ JEV_API_KEY: "key", MENTION_JUDGE_DIR: "/nonexistent" });
		expect(analyzer.judgeVersion).toBe("jev-latest");
		expect(analyzer.concurrency).toBeGreaterThan(1);
	});

	it("matches by substring with no judge configured", async () => {
		expect((await loadMentionAnalyzer({})).judgeVersion).toBeNull();
	});
});
