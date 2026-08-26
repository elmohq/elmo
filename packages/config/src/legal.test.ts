import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENTS, legalUrl, showsLegalLinks } from "./legal";

describe("showsLegalLinks", () => {
	it("links Elmo's policies from the deployments Elmo operates or ships", () => {
		expect(showsLegalLinks("cloud")).toBe(true);
		expect(showsLegalLinks("demo")).toBe(true);
		expect(showsLegalLinks("local")).toBe(true);
	});

	it("stays silent in whitelabel, where the operator's own agreements govern", () => {
		expect(showsLegalLinks("whitelabel")).toBe(false);
	});

	it("stays silent before the mode is known", () => {
		expect(showsLegalLinks(undefined)).toBe(false);
	});
});

describe("legalUrl", () => {
	it("resolves to the published document on the marketing site", () => {
		expect(legalUrl("terms")).toBe("https://www.elmohq.com/legal/terms");
	});

	it("covers the terms and privacy policy the app is required to link", () => {
		const slugs = LEGAL_DOCUMENTS.map((document) => document.slug);
		expect(slugs).toContain("terms");
		expect(slugs).toContain("privacy");
	});
});
