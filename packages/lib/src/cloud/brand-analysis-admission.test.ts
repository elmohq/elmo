import { describe, expect, it } from "vitest";
import {
	cloudBrandAnalysisJobDataSchema,
	cloudBrandAnalysisRequestFingerprint,
	decideCloudBrandAnalysisAdmission,
	isCloudBrandAnalysisJobData,
} from "./brand-analysis-admission";

const fingerprint = "a".repeat(64);

describe("cloud brand-analysis admission", () => {
	it("deduplicates pending and already-completed requests", () => {
		expect(
			decideCloudBrandAnalysisAdmission(
				{ status: "pending", requestFingerprint: fingerprint, generation: 1 },
				fingerprint,
			),
		).toEqual({ kind: "reuse" });
		expect(
			decideCloudBrandAnalysisAdmission(
				{ status: "completed", requestFingerprint: fingerprint, generation: 1 },
				fingerprint,
			),
		).toEqual({ kind: "reuse" });
	});

	it("marks an in-flight result stale when authoritative brand inputs change", () => {
		expect(
			decideCloudBrandAnalysisAdmission({ status: "pending", requestFingerprint: "old", generation: 1 }, fingerprint),
		).toEqual({ kind: "stale" });
	});

	it("admits a new generation after failure or an authoritative input change", () => {
		expect(
			decideCloudBrandAnalysisAdmission(
				{ status: "failed", requestFingerprint: fingerprint, generation: 1 },
				fingerprint,
			),
		).toEqual({ kind: "admit", generation: 2 });
		expect(
			decideCloudBrandAnalysisAdmission({ status: "completed", requestFingerprint: "old", generation: 2 }, fingerprint),
		).toEqual({ kind: "admit", generation: 3 });
	});

	it("fails closed once three provider calls could have been admitted", () => {
		expect(
			decideCloudBrandAnalysisAdmission(
				{ status: "failed", requestFingerprint: fingerprint, generation: 3 },
				fingerprint,
			),
		).toEqual({ kind: "limit" });
	});

	it("fingerprints all authoritative inputs deterministically", () => {
		const input = { brandId: "acme", brandName: "Acme", website: "acme.test" };
		const first = cloudBrandAnalysisRequestFingerprint(input);
		expect(first).toMatch(/^[a-f0-9]{64}$/);
		expect(cloudBrandAnalysisRequestFingerprint(input)).toBe(first);
		expect(cloudBrandAnalysisRequestFingerprint({ ...input, website: "new.acme.test" })).not.toBe(first);
	});

	it("accepts only the versioned, strict durable job contract", () => {
		const data = {
			version: 1 as const,
			organizationId: "org-1",
			brandId: "acme",
			admissionGeneration: 1,
			requestFingerprint: fingerprint,
			website: "acme.test",
			brandName: "Acme",
		};
		expect(isCloudBrandAnalysisJobData(data)).toBe(true);
		expect(cloudBrandAnalysisJobDataSchema.safeParse({ ...data, unexpected: true }).success).toBe(false);
		expect(isCloudBrandAnalysisJobData({ ...data, requestFingerprint: "not-a-fingerprint" })).toBe(false);
		expect(isCloudBrandAnalysisJobData({ ...data, admissionGeneration: 4 })).toBe(false);
	});
});
