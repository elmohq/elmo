import { describe, expect, it, vi } from "vitest";
import { adaptivePool, JEV_MODEL, type JevRequest, RateLimited, typesafeTransport } from "./jev";

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

describe("adaptivePool", () => {
	const ok = { answers: { brand__verdict: { choice: "positive", probabilities: { positive: 1 } } } };
	const clock = () => {
		let at = 0;
		return {
			now: () => at,
			wait: async (ms: number) => {
				at += ms;
			},
		};
	};

	it("reports a rate limit with how long Jev asks to wait", async () => {
		const fetchImpl = vi.fn(async () => new Response("slow down", { status: 429, headers: { "retry-after": "2" } }));
		await expect(typesafeTransport("secret", fetchImpl as unknown as typeof fetch)(request)).rejects.toMatchObject({
			retryAfterMs: 2000,
		});
	});

	/** Start times of each call, for a pool whose API rate-limits the calls listed in `refuse`. */
	async function starts(calls: number, refuse: number[] = []) {
		const time = clock();
		const at: number[] = [];
		const pool = adaptivePool(
			async () => {
				at.push(time.now());
				if (refuse.includes(at.length)) throw new RateLimited(1000, "slow down");
				return ok;
			},
			{ ...time, start: 2 },
		);
		for (let i = 0; i < calls; i++) await pool(request);
		return at.slice(1).map((t, i) => t - at[i]);
	}

	it("spaces calls out, closer together while they succeed", async () => {
		const gaps = await starts(20);
		expect(gaps[0]).toBe(500);
		expect(gaps.at(-1)).toBeLessThan(250);
	});

	it("waits out a rate limit, sends the call again, and slows down after", async () => {
		const gaps = await starts(12, [10]);
		expect(gaps[9]).toBeGreaterThanOrEqual(1000);
		expect(gaps[10]).toBeGreaterThan(gaps[8]);
	});

	it("gives up after repeated rate limits, so the job retries later, and passes other failures straight on", async () => {
		const limited = adaptivePool(
			async () => {
				throw new RateLimited(10, "slow down");
			},
			{ ...clock(), retries: 2 },
		);
		await expect(limited(request)).rejects.toThrow("HTTP 429");
		const broken = adaptivePool(async () => {
			throw new Error("HTTP 500");
		});
		await expect(broken(request)).rejects.toThrow("HTTP 500");
	});
});
