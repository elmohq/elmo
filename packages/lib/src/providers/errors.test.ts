import { describe, expect, it } from "vitest";
import {
	errorHasAcceptedTask,
	isProviderDefinitivelyRejected,
	isProviderFatalError,
	ProviderFatalError,
	providerHttpResponseError,
	ProviderRequestUncertainError,
	ProviderResponseError,
	providerErrorStatus,
} from "./errors";

describe("provider error classification", () => {
	it("finds status codes nested by provider SDK transports", () => {
		const error = { details: { cause: { details: { response: { status: 402 } } } } };
		expect(providerErrorStatus(error)).toBe(402);
		expect(isProviderFatalError(error)).toBe(true);
	});

	it("distinguishes rejected submissions from errors reading accepted tasks", () => {
		expect(errorHasAcceptedTask(new ProviderResponseError("rejected"))).toBe(false);
		expect(errorHasAcceptedTask(new ProviderResponseError("poll failed", { taskAccepted: true }))).toBe(true);
		expect(errorHasAcceptedTask(new ProviderFatalError("auth", { taskAccepted: true }))).toBe(true);
	});

	it("only retries HTTP statuses that prove a POST was rejected", () => {
		for (const status of [400, 401, 402, 403, 404, 405, 413, 415, 422]) {
			expect(isProviderDefinitivelyRejected(providerHttpResponseError("rejected", status))).toBe(true);
		}
		for (const status of [408, 409, 425, 429, 500, 502, 503, 504]) {
			const error = providerHttpResponseError("uncertain", status);
			expect(error).toBeInstanceOf(ProviderRequestUncertainError);
			expect(isProviderDefinitivelyRejected(error)).toBe(false);
		}
	});

	it("uses the same narrow rejection allowlist for SDK errors", () => {
		expect(isProviderDefinitivelyRejected({ status: 422 })).toBe(true);
		expect(isProviderDefinitivelyRejected({ status: 429 })).toBe(false);
		expect(isProviderDefinitivelyRejected({ status: 500 })).toBe(false);
	});

	it("handles cyclic SDK error causes", () => {
		const error: Record<string, unknown> = {};
		error.cause = error;
		expect(providerErrorStatus(error)).toBeNull();
	});
});
