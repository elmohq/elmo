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
			expect(result.updates).not.toHaveProperty("domain");
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

	describe("domain", () => {
		it("keeps a bare domain as-is", () => {
			const result = normalizeBrandUpdate({ domain: "acme.com" });
			expect(result).toEqual({ ok: true, updates: { domain: "acme.com" } });
		});

		it("reduces a full URL to its domain", () => {
			const result = normalizeBrandUpdate({ domain: "https://www.acme.com/products?ref=nav" });
			expect(result).toEqual({ ok: true, updates: { domain: "acme.com" } });
		});

		it("rejects an invalid domain", () => {
			const result = normalizeBrandUpdate({ domain: "not a url" });
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
			domain: "acme.com",
			additionalDomains: ["acme.io", "acme.io"],
			aliases: [" Acme ", "Acme"],
		});
		expect(result).toEqual({
			ok: true,
			updates: {
				name: "Acme",
				domain: "acme.com",
				additionalDomains: ["acme.io"],
				aliases: ["Acme"],
			},
		});
	});
});
