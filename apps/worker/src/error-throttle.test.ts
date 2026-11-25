import { describe, expect, it } from "vitest";
import { createErrorThrottle } from "./error-throttle";

function setup() {
	let time = 0;
	const throttle = createErrorThrottle({ intervalMs: 60_000, now: () => time });
	return {
		throttle,
		advance: (ms: number) => {
			time += ms;
		},
	};
}

describe("createErrorThrottle", () => {
	it("reports the first occurrence of an error", () => {
		const { throttle } = setup();
		expect(throttle(new Error("boom"))).toEqual({ suppressed: 0 });
	});

	it("suppresses repeats within the interval", () => {
		const { throttle, advance } = setup();
		throttle(new Error("boom"));
		advance(30_000);
		expect(throttle(new Error("boom"))).toBeNull();
		expect(throttle(new Error("boom"))).toBeNull();
	});

	it("reports again after the interval with the number suppressed", () => {
		const { throttle, advance } = setup();
		throttle(new Error("boom"));
		throttle(new Error("boom"));
		throttle(new Error("boom"));
		advance(60_000);
		expect(throttle(new Error("boom"))).toEqual({ suppressed: 2 });
	});

	it("throttles different messages independently", () => {
		const { throttle } = setup();
		throttle(new Error("boom"));
		expect(throttle(new Error("bang"))).toEqual({ suppressed: 0 });
	});

	it("treats the same error from different queues and workers as one", () => {
		const { throttle } = setup();
		throttle({ message: "timeout exceeded when trying to connect (Queue: a, Worker: 1)" });
		expect(throttle({ message: "timeout exceeded when trying to connect (Queue: b, Worker: 2)" })).toBeNull();
		expect(throttle(new Error("timeout exceeded when trying to connect"))).toBeNull();
	});
});
