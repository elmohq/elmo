import { describe, expect, it } from "vitest";
import { normalizeBrandUpdate } from "@/lib/brand-settings";

describe("normalizeBrandUpdate", () => {
	it("returns an empty update set when no fields are provided", () => {
		const result = normalizeBrandUpdate({});
		expect(result).toEqual({ ok: true, updates: {} });
	});

	it("only touches fields that are present (partial edit)", () => {
		const result = normalizeBrandUpdate({ name: "Acme" });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.updates).toEqual({ name: "Acme" });
			expect(result.updates).not.toHaveProperty("website");
			expect(result.updates).not.toHaveProperty("aliases");
		}
	});

	describe("name", () => {
		it("trims surrounding whitespace", () => {
			const result = normalizeBrandUpdate({ name: "  Acme  " });
			expect(result).toEqual({ ok: true, updates: { name: "Acme" } });
		});

		it.each([
			["empty string", ""],
			["whitespace only", "   "],
		])("rejects a %s name", (_label, name) => {
			expect(normalizeBrandUpdate({ name })).toEqual({
				ok: false,
				error: "Brand name must be a non-empty string",
			});
		});
	});

	describe("website", () => {
		it("adds a scheme to a bare domain", () => {
			const result = normalizeBrandUpdate({ website: "acme.com" });
			expect(result).toEqual({ ok: true, updates: { website: "https://acme.com/" } });
		});

		it("adds a scheme to a bare domain and keeps the path", () => {
			const result = normalizeBrandUpdate({ website: "acme.com/products" });
			expect(result).toEqual({ ok: true, updates: { website: "https://acme.com/products" } });
		});

		it("keeps the path of a full URL", () => {
			const result = normalizeBrandUpdate({ website: "https://www.acme.com/products?ref=nav" });
			expect(result).toEqual({ ok: true, updates: { website: "https://www.acme.com/products?ref=nav" } });
		});

		it("rejects an invalid website", () => {
			const result = normalizeBrandUpdate({ website: "not a url" });
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.error).toMatch(/valid/i);
		});
	});

	describe("additionalDomains", () => {
		it("cleans and de-duplicates valid domains", () => {
			const result = normalizeBrandUpdate({
				additionalDomains: ["https://www.acme.com/path", "acme.com", "blog.acme.io"],
			});
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.updates.additionalDomains).toEqual(["acme.com", "blog.acme.io"]);
			}
		});

		it("reports every invalid domain in the input", () => {
			const result = normalizeBrandUpdate({
				additionalDomains: ["acme.com", "not a domain", "also bad"],
			});
			expect(result).toEqual({
				ok: false,
				error: "Invalid domain(s): not a domain, also bad",
			});
		});

		it("accepts an empty list", () => {
			const result = normalizeBrandUpdate({ additionalDomains: [] });
			expect(result).toEqual({ ok: true, updates: { additionalDomains: [] } });
		});

		describe("redundant subdomains", () => {
			it("drops a subdomain of another additional domain", () => {
				const result = normalizeBrandUpdate({ additionalDomains: ["acme.io", "blog.acme.io"] });
				expect(result.ok).toBe(true);
				if (result.ok) expect(result.updates.additionalDomains).toEqual(["acme.io"]);
			});

			it("drops the subdomain whichever order it was entered in", () => {
				const result = normalizeBrandUpdate({ additionalDomains: ["blog.acme.io", "acme.io"] });
				expect(result.ok).toBe(true);
				if (result.ok) expect(result.updates.additionalDomains).toEqual(["acme.io"]);
			});

			it("collapses a chain of nested subdomains to the broadest entry", () => {
				const result = normalizeBrandUpdate({
					additionalDomains: ["eu.blog.acme.io", "blog.acme.io", "acme.io"],
				});
				expect(result.ok).toBe(true);
				if (result.ok) expect(result.updates.additionalDomains).toEqual(["acme.io"]);
			});

			it("keeps a domain that only shares a suffix without a label boundary", () => {
				const result = normalizeBrandUpdate({
					additionalDomains: ["acme.io", "notacme.io", "fake-acme.io"],
				});
				expect(result.ok).toBe(true);
				if (result.ok) {
					expect(result.updates.additionalDomains).toEqual(["acme.io", "notacme.io", "fake-acme.io"]);
				}
			});

			it("drops a domain already covered by the website in the same update", () => {
				const result = normalizeBrandUpdate({
					website: "https://www.acme.com/products",
					additionalDomains: ["blog.acme.com", "acme.com", "acme.io"],
				});
				expect(result.ok).toBe(true);
				if (result.ok) expect(result.updates.additionalDomains).toEqual(["acme.io"]);
			});

			it("leaves subdomains alone when the website is not part of the update", () => {
				const result = normalizeBrandUpdate({ additionalDomains: ["blog.acme.com"] });
				expect(result.ok).toBe(true);
				if (result.ok) expect(result.updates.additionalDomains).toEqual(["blog.acme.com"]);
			});
		});
	});

	describe("aliases", () => {
		it("trims, drops empties, and de-duplicates", () => {
			const result = normalizeBrandUpdate({ aliases: ["Acme", "  Acme Inc ", "", "  ", "Acme"] });
			expect(result.ok).toBe(true);
			if (result.ok) expect(result.updates.aliases).toEqual(["Acme", "Acme Inc"]);
		});
	});

	it("validates all provided fields together", () => {
		const result = normalizeBrandUpdate({
			name: " Acme ",
			website: "acme.com",
			additionalDomains: ["acme.io", "acme.io"],
			aliases: [" Acme ", "Acme"],
		});
		expect(result).toEqual({
			ok: true,
			updates: {
				name: "Acme",
				website: "https://acme.com/",
				additionalDomains: ["acme.io"],
				aliases: ["Acme"],
			},
		});
	});
});
