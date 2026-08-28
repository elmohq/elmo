import { describe, expect, it } from "vitest";
import { organizationTitle } from "@/lib/organizations/naming";

describe("organizationTitle", () => {
	it("says what the thing is, since a company name alone doesn't", () => {
		expect(organizationTitle("Nike")).toBe("Nike Organization");
		expect(organizationTitle("Acme Corp")).toBe("Acme Corp Organization");
	});

	it("doesn't say it twice, however the customer capitalized it", () => {
		expect(organizationTitle("Acme Organization")).toBe("Acme Organization");
		expect(organizationTitle("Acme organization")).toBe("Acme organization");
		expect(organizationTitle("Acme ORGANIZATION")).toBe("Acme ORGANIZATION");
	});

	it("ignores trailing space when deciding", () => {
		expect(organizationTitle("Acme Organization ")).toBe("Acme Organization");
		expect(organizationTitle(" Nike ")).toBe("Nike Organization");
	});
});
