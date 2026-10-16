import { describe, expect, it, vi } from "vitest";
import { JEV_MODEL, type JevRequest, typesafeTransport } from "./jev";

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
		await expect(typesafeTransport("secret", respond(429, "slow down"))(request)).rejects.toThrow("HTTP 429");
	});

	it("throws when a question goes unanswered rather than judging on half an answer", async () => {
		await expect(typesafeTransport("secret", respond(200, { answers: {} }))(request)).rejects.toThrow("brand__verdict");
		const empty = { answers: { brand__verdict: { choice: "positive", probabilities: {} } } };
		await expect(typesafeTransport("secret", respond(200, empty))(request)).rejects.toThrow("brand__verdict");
	});
});
