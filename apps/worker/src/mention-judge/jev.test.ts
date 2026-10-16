import { describe, expect, it, vi } from "vitest";
import { estimatedTokens, JEV_MODEL, type JevRequest, tokenBudget, typesafeTransport } from "./jev";

const request: JevRequest = {
	model: JEV_MODEL,
	state: { answer: "Elmo is great." },
	questions: { brand__verdict: { type: "choice", instructions: "How?", criteria: { positive: "+", neutral: "0" } } },
};

const respond = (status: number, body: unknown) =>
	vi.fn(
		async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
	) as unknown as typeof fetch;

describe("typesafeTransport", () => {
	it("sends the request with the key and returns every answer", async () => {
		const fetchImpl = respond(200, {
			answers: { brand__verdict: { choice: "positive", probabilities: { positive: 0.9, neutral: 0.1 } } },
		});
		const response = await typesafeTransport("secret", fetchImpl)(request);
		expect(response.answers.brand__verdict.choice).toBe("positive");
		const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(init.headers.Authorization).toBe("Bearer secret");
		expect(JSON.parse(init.body).model).toBe(JEV_MODEL);
	});

	it("says so when the key is rejected", async () => {
		await expect(typesafeTransport("secret", respond(401, "bad key"))(request)).rejects.toThrow(
			"TYPESAFE_API_KEY was rejected",
		);
	});

	it("throws on an error status, so the job retries", async () => {
		await expect(typesafeTransport("secret", respond(500, "oops"))(request)).rejects.toThrow("HTTP 500");
	});

	it("throws when a question goes unanswered rather than judging on half an answer", async () => {
		await expect(typesafeTransport("secret", respond(200, { answers: {} }))(request)).rejects.toThrow("brand__verdict");
		const empty = { answers: { brand__verdict: { choice: "positive", probabilities: {} } } };
		await expect(typesafeTransport("secret", respond(200, empty))(request)).rejects.toThrow("brand__verdict");
	});
});

describe("rate limits", () => {
	const ok = { answers: { brand__verdict: { choice: "positive", probabilities: { positive: 1 } } } };

	it("waits out a rate limit, as long as the API asks, and then succeeds", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "retry-after": "2" } }))
			.mockResolvedValueOnce(new Response(JSON.stringify(ok), { status: 200 }));
		const waits: number[] = [];
		const transport = typesafeTransport("secret", fetchImpl as unknown as typeof fetch, async (ms) => {
			waits.push(ms);
		});
		expect((await transport(request)).answers.brand__verdict.choice).toBe("positive");
		expect(waits).toEqual([2000]);
	});

	it("gives up after repeated rate limits, so the job retries later", async () => {
		const fetchImpl = vi.fn(async () => new Response("slow down", { status: 429 }));
		const transport = typesafeTransport("secret", fetchImpl as unknown as typeof fetch, async () => {});
		await expect(transport(request)).rejects.toThrow("HTTP 429");
	});

	it("holds requests back to stay within a tokens-per-second budget", async () => {
		let clock = 0;
		const sent: number[] = [];
		const budget = tokenBudget(
			async () => {
				sent.push(clock);
				return ok;
			},
			estimatedTokens(request) * 2,
			{
				now: () => clock,
				wait: async (ms) => {
					clock += ms;
				},
			},
		);
		await Promise.all([budget(request), budget(request), budget(request), budget(request)]);
		expect(sent).toEqual([0, 0, 500, 1000]);
	});
});
