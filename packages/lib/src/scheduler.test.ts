import { afterEach, describe, expect, it, vi } from "vitest";
import {
	executionFailureBackoffMs,
	getPromptMaxProviderCalls,
	getPromptRunConcurrency,
	getProviderMaxConcurrency,
	getReportMaxProviderCalls,
	nextPromptRunAt,
	PROVIDER_FATAL_COOLDOWN_MS,
	providerCircuitKey,
	providerTaskResumeBackoffMs,
	transientProviderCooldownMs,
} from "./scheduler";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

afterEach(() => vi.unstubAllEnvs());

describe("PROMPT_RUN_CONCURRENCY", () => {
	it("defaults to six when unset", () => {
		vi.stubEnv("PROMPT_RUN_CONCURRENCY", undefined);
		expect(getPromptRunConcurrency()).toBe(6);
	});

	it("accepts a positive integer", () => {
		vi.stubEnv("PROMPT_RUN_CONCURRENCY", "12");
		expect(getPromptRunConcurrency()).toBe(12);
	});

	it.each(["", "   ", "0", "-1", "1.5", "not-a-number", "Infinity", "9007199254740992"])(
		"fails closed for invalid value %j",
		(value) => {
			vi.stubEnv("PROMPT_RUN_CONCURRENCY", value);
			expect(() => getPromptRunConcurrency()).toThrow("PROMPT_RUN_CONCURRENCY must be an integer");
		},
	);
});

describe("PROVIDER_MAX_CONCURRENCY", () => {
	it("allows zero as an emergency new-spend stop", () => {
		vi.stubEnv("PROVIDER_MAX_CONCURRENCY", "0");
		expect(getProviderMaxConcurrency()).toBe(0);
	});

	it("rejects malformed or negative explicit values", () => {
		vi.stubEnv("PROVIDER_MAX_CONCURRENCY", "not-a-number");
		expect(() => getProviderMaxConcurrency()).toThrow("PROVIDER_MAX_CONCURRENCY must be an integer");
	});
});

describe("PROMPT_MAX_PROVIDER_CALLS", () => {
	it("defaults to a finite per-cycle budget", () => {
		vi.stubEnv("PROMPT_MAX_PROVIDER_CALLS", undefined);
		expect(getPromptMaxProviderCalls()).toBe(50);
	});

	it.each(["0", "1.5", "invalid"])("fails closed for invalid value %j", (value) => {
		vi.stubEnv("PROMPT_MAX_PROVIDER_CALLS", value);
		expect(() => getPromptMaxProviderCalls()).toThrow("PROMPT_MAX_PROVIDER_CALLS must be an integer");
	});
});

describe("REPORT_MAX_PROVIDER_CALLS", () => {
	it("defaults to a finite report budget", () => {
		vi.stubEnv("REPORT_MAX_PROVIDER_CALLS", undefined);
		expect(getReportMaxProviderCalls()).toBe(1500);
	});

	it("accepts a positive integer and zero as a report kill switch", () => {
		vi.stubEnv("REPORT_MAX_PROVIDER_CALLS", "250");
		expect(getReportMaxProviderCalls()).toBe(250);
		vi.stubEnv("REPORT_MAX_PROVIDER_CALLS", "0");
		expect(getReportMaxProviderCalls()).toBe(0);
	});
});

describe("failure isolation", () => {
	it("uses a distinct circuit for provider routes that can fail independently", () => {
		expect(providerCircuitKey({ provider: "cloro", model: "chatgpt", webSearch: true })).not.toBe(
			providerCircuitKey({ provider: "cloro", model: "perplexity", webSearch: true }),
		);
	});

	it("escalates code-side execution backoff to one week", () => {
		expect([1, 2, 3, 4, 10].map(executionFailureBackoffMs)).toEqual([
			24 * HOUR_MS,
			48 * HOUR_MS,
			96 * HOUR_MS,
			168 * HOUR_MS,
			168 * HOUR_MS,
		]);
	});
});

describe("nextPromptRunAt", () => {
	it("anchors the next cadence to admission time instead of catching up missed intervals", () => {
		const admittedAfterOutage = new Date("2026-08-10T12:30:00.000Z");

		expect(nextPromptRunAt(admittedAfterOutage, 24)).toEqual(new Date("2026-08-11T12:30:00.000Z"));
	});

	it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects unsafe cadence %s", (cadence) => {
		expect(() => nextPromptRunAt(new Date(), cadence)).toThrow("Prompt cadence must be a positive number");
	});
});

describe("provider cooldowns", () => {
	it("backs repeated accepted-task polling off to one attempt per hour", () => {
		expect([1, 2, 3, 4, 5, 20].map(providerTaskResumeBackoffMs)).toEqual([
			30 * 1000,
			2 * MINUTE_MS,
			10 * MINUTE_MS,
			30 * MINUTE_MS,
			HOUR_MS,
			HOUR_MS,
		]);
	});

	it("opens on the fifth transient failure and escalates repeated trips up to six hours", () => {
		expect([4, 5, 6, 7, 8, 9, 100].map((failures) => transientProviderCooldownMs(failures))).toEqual([
			null,
			5 * MINUTE_MS,
			15 * MINUTE_MS,
			HOUR_MS,
			6 * HOUR_MS,
			6 * HOUR_MS,
			6 * HOUR_MS,
		]);
	});

	it("holds fatal provider failures for 24 hours", () => {
		expect(PROVIDER_FATAL_COOLDOWN_MS).toBe(24 * HOUR_MS);
	});
});
