import { describe, expect, it } from "vitest";
import { apiCreateInputToInternal, apiUpdateInputToInternal } from "@/server/onboarding-core";

// The v1 brands API takes one flat `domains` list: the first entry becomes the
// website and the rest become additional domains.
describe("splitting the API's domain list for storage", () => {
	it("takes the first entry as the website", () => {
		const result = apiUpdateInputToInternal("acme", { domains: ["acme.com", "acme.io"] });

		expect(result.website).toBe("https://acme.com");
		expect(result.additionalDomains).toEqual(["acme.io"]);
	});

	it("drops an entry the website already covers", () => {
		const result = apiUpdateInputToInternal("acme", {
			domains: ["acme.com", "blog.acme.com", "acme.io"],
		});

		expect(result.additionalDomains).toEqual(["acme.io"]);
	});

	it("drops an entry a broader sibling already covers", () => {
		const result = apiUpdateInputToInternal("acme", {
			domains: ["acme.com", "shop.acme.io", "acme.io"],
		});

		expect(result.additionalDomains).toEqual(["acme.io"]);
	});

	it("keeps a domain that only shares a suffix without a label boundary", () => {
		const result = apiCreateInputToInternal({
			id: "acme",
			name: "Acme",
			domains: ["acme.io", "notacme.io", "fake-acme.io"],
		});

		expect(result.additionalDomains).toEqual(["notacme.io", "fake-acme.io"]);
	});

	it("applies the same rule on create", () => {
		const result = apiCreateInputToInternal({
			id: "acme",
			name: "Acme",
			domains: ["https://www.acme.com/products", "blog.acme.com", "acme.io"],
		});

		expect(result.website).toBe("https://acme.com");
		expect(result.additionalDomains).toEqual(["acme.io"]);
	});
});
