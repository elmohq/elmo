import type { JobWithMetadata } from "pg-boss";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	analyzeBrand: vi.fn(),
	begin: vi.fn(),
	complete: vi.fn(),
	fail: vi.fn(),
	renew: vi.fn(),
}));

vi.mock("@workspace/lib/onboarding", () => ({
	analyzeBrand: mocks.analyzeBrand,
	legacyAnalyzeBrandJobDataSchema: {
		safeParse: (value: unknown) => {
			const valid =
				!!value &&
				typeof value === "object" &&
				"brandId" in value &&
				typeof value.brandId === "string" &&
				"website" in value &&
				typeof value.website === "string";
			return valid ? { success: true, data: value } : { success: false };
		},
	},
}));
vi.mock("@workspace/lib/cloud/brand-analysis-admission", () => ({
	CLOUD_BRAND_ANALYSIS_MAX_WEB_SEARCH_USES: 5,
	CLOUD_BRAND_ANALYSIS_PROVIDER_HEARTBEAT_MS: 60_000,
	isCloudBrandAnalysisJobData: (value: unknown) =>
		!!value &&
		typeof value === "object" &&
		"version" in value &&
		value.version === 2 &&
		"organizationId" in value &&
		typeof value.organizationId === "string" &&
		"requestFingerprint" in value &&
		typeof value.requestFingerprint === "string" &&
		value.requestFingerprint.length === 64,
	hasCloudBrandAnalysisJobMarker: (value: unknown) =>
		!!value &&
		typeof value === "object" &&
		("version" in value || "organizationId" in value || "admissionGeneration" in value),
	beginCloudBrandAnalysisProviderCall: mocks.begin,
	completeCloudBrandAnalysisAdmission: mocks.complete,
	failCloudBrandAnalysisAdmission: mocks.fail,
	renewCloudBrandAnalysisProviderLease: mocks.renew,
}));

import { type AnalyzeBrandData, analyzeBrandJob } from "./analyze-brand";

const suggestion = {
	brandName: "Acme",
	website: "acme.test",
	additionalDomains: [],
	aliases: [],
	competitors: [],
	suggestedPrompts: [],
};

function job(
	data: AnalyzeBrandData,
	metadata: { retryLimit?: number; retryCount?: number } = {},
): JobWithMetadata<AnalyzeBrandData> {
	return {
		id: "11111111-1111-4111-8111-111111111111",
		data,
		retryLimit: metadata.retryLimit ?? 0,
		retryCount: metadata.retryCount ?? 0,
	} as JobWithMetadata<AnalyzeBrandData>;
}

const cloudData = {
	version: 2 as const,
	organizationId: "org-1",
	brandId: "acme",
	admissionGeneration: 1,
	requestFingerprint: "a".repeat(64),
};

describe("analyze-brand durable cloud projection", () => {
	beforeEach(() => {
		mocks.analyzeBrand.mockReset();
		mocks.begin.mockReset();
		mocks.complete.mockReset();
		mocks.fail.mockReset();
		mocks.renew.mockReset();
		mocks.begin.mockResolvedValue({ website: "acme.test", brandName: "Acme" });
		mocks.renew.mockResolvedValue(true);
	});

	afterEach(() => vi.useRealTimers());

	it("persists a cloud result before completing the queue job", async () => {
		mocks.analyzeBrand.mockResolvedValue(suggestion);
		mocks.complete.mockResolvedValue(true);

		await expect(analyzeBrandJob([job(cloudData)], "cloud")).resolves.toEqual(suggestion);
		expect(mocks.analyzeBrand).toHaveBeenCalledWith({
			website: "acme.test",
			brandName: "Acme",
			maxProviderRetries: 0,
			maxWebSearchUses: 5,
		});
		expect(mocks.begin).toHaveBeenCalledWith({
			jobId: "11111111-1111-4111-8111-111111111111",
			data: cloudData,
		});
		expect(mocks.complete).toHaveBeenCalledWith({
			jobId: "11111111-1111-4111-8111-111111111111",
			data: cloudData,
			result: suggestion,
		});
		expect(mocks.fail).not.toHaveBeenCalled();
	});

	it("durably records a provider failure and still fails the queue job", async () => {
		const providerError = new Error("provider unavailable");
		mocks.analyzeBrand.mockRejectedValue(providerError);
		mocks.fail.mockResolvedValue(true);

		await expect(analyzeBrandJob([job(cloudData)], "cloud")).rejects.toBe(providerError);
		expect(mocks.fail).toHaveBeenCalledWith({
			jobId: "11111111-1111-4111-8111-111111111111",
			data: cloudData,
			error: providerError,
		});
	});

	it("keeps the durable provider lease alive while analysis is running", async () => {
		vi.useFakeTimers();
		let finishAnalysis!: (value: typeof suggestion) => void;
		mocks.analyzeBrand.mockReturnValue(
			new Promise<typeof suggestion>((resolve) => {
				finishAnalysis = resolve;
			}),
		);
		mocks.complete.mockResolvedValue(true);

		const pending = analyzeBrandJob([job(cloudData)], "cloud");
		await vi.advanceTimersByTimeAsync(60_000);
		expect(mocks.renew).toHaveBeenCalledWith({
			jobId: "11111111-1111-4111-8111-111111111111",
			data: cloudData,
		});
		finishAnalysis(suggestion);
		await expect(pending).resolves.toEqual(suggestion);
	});

	it("rejects a late provider result after the durable lease is lost", async () => {
		vi.useFakeTimers();
		let finishAnalysis!: (value: typeof suggestion) => void;
		mocks.analyzeBrand.mockReturnValue(
			new Promise<typeof suggestion>((resolve) => {
				finishAnalysis = resolve;
			}),
		);
		mocks.renew.mockResolvedValue(false);
		mocks.fail.mockResolvedValue(true);

		const pending = analyzeBrandJob([job(cloudData)], "cloud");
		await vi.advanceTimersByTimeAsync(60_000);
		finishAnalysis(suggestion);
		await expect(pending).rejects.toThrow("provider lease was lost");
		expect(mocks.complete).not.toHaveBeenCalled();
		expect(mocks.fail).toHaveBeenCalledWith(
			expect.objectContaining({
				jobId: "11111111-1111-4111-8111-111111111111",
				data: cloudData,
				error: expect.objectContaining({ message: "Cloud brand-analysis provider lease was lost" }),
			}),
		);
	});

	it("preserves the noncloud job contract without cloud projections", async () => {
		mocks.analyzeBrand.mockResolvedValue(suggestion);
		const legacyData = {
			brandId: "acme",
			website: "acme.test",
			brandName: "Acme",
			maxCompetitors: 4,
			maxPrompts: 12,
		};

		await expect(analyzeBrandJob([job(legacyData)], "whitelabel")).resolves.toEqual(suggestion);
		expect(mocks.analyzeBrand).toHaveBeenCalledWith({
			website: "acme.test",
			brandName: "Acme",
			maxCompetitors: 4,
			maxPrompts: 12,
		});
		expect(mocks.complete).not.toHaveBeenCalled();
		expect(mocks.fail).not.toHaveBeenCalled();
	});

	it("rejects malformed cloud-marked payloads before provider I/O", async () => {
		const malformed = { ...cloudData, requestFingerprint: "bad" } as AnalyzeBrandData;
		await expect(analyzeBrandJob([job(malformed)], "cloud")).rejects.toThrow(
			"invalid or unsupported cloud admission payload",
		);
		expect(mocks.analyzeBrand).not.toHaveBeenCalled();
	});

	it("rejects legacy payloads in cloud without provider I/O", async () => {
		const legacy = { brandId: "acme", website: "acme.test" };
		await expect(analyzeBrandJob([job(legacy)], "cloud")).rejects.toThrow("durable admission payload");
		expect(mocks.analyzeBrand).not.toHaveBeenCalled();
	});

	it("rejects a cloud job whose queue metadata permits another provider attempt", async () => {
		await expect(analyzeBrandJob([job(cloudData, { retryLimit: 1 })], "cloud")).rejects.toThrow("retries disabled");
		expect(mocks.analyzeBrand).not.toHaveBeenCalled();
	});

	it("requires a matching pending admission before provider I/O", async () => {
		mocks.begin.mockResolvedValue(false);
		await expect(analyzeBrandJob([job(cloudData)], "cloud")).rejects.toThrow("no current pending admission");
		expect(mocks.analyzeBrand).not.toHaveBeenCalled();
	});
});
