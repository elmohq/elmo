import { CapacityExceededError, EntitlementAccessError } from "@workspace/lib/cloud/capacity";
import { describe, expect, it } from "vitest";
import {
	mapOrganizationResourceError,
	toOrganizationApiBrandCreate,
	toOrganizationApiBrandUpdate,
} from "../organization-resources.server";

describe("organization API brand input", () => {
	it("binds a cloud brand to the authenticated organization and normalizes nested resources", () => {
		expect(
			toOrganizationApiBrandCreate("authenticated-org", {
				id: "brand-a",
				name: "Brand A",
				website: "https://brand.example",
				additionalDomains: ["www.brand.example", "https://shop.brand.example/path"],
				aliases: [" Brand ", "brand", ""],
				competitors: [
					{
						name: " Competitor ",
						domains: ["brand.example", "https://competitor.example/page"],
						aliases: [" Rival ", "rival"],
					},
				],
				prompts: [{ value: "Where should I shop?", enabled: true, tags: [" Retail ", "retail"] }],
			}),
		).toEqual({
			organizationId: "authenticated-org",
			id: "brand-a",
			name: "Brand A",
			website: "https://brand.example",
			additionalDomains: ["shop.brand.example"],
			aliases: ["Brand"],
			competitors: [{ name: "Competitor", domains: ["competitor.example"], aliases: ["Rival"] }],
			prompts: [{ value: "Where should I shop?", enabled: true, tags: ["retail"] }],
		});
	});

	it("preserves omitted patch fields while normalizing replacements", () => {
		expect(
			toOrganizationApiBrandUpdate("authenticated-org", {
				brandId: "brand-a",
				website: "https://brand.example",
				additionalDomains: ["brand.example", "shop.brand.example"],
				aliases: [" Brand ", "brand"],
			}),
		).toEqual({
			organizationId: "authenticated-org",
			brandId: "brand-a",
			name: undefined,
			website: "https://brand.example",
			additionalDomains: ["shop.brand.example"],
			aliases: ["Brand"],
			enabled: undefined,
		});
	});
});

describe("organization API error mapping", () => {
	it("returns a conflict for plan capacity and a forbidden response for lapsed access", () => {
		expect(mapOrganizationResourceError(new CapacityExceededError("prompts", 50))).toMatchObject({ status: 409 });
		expect(mapOrganizationResourceError(new EntitlementAccessError("subscription inactive"))).toMatchObject({
			status: 403,
		});
	});
});
