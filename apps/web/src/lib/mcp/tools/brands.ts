/** Brands and the competitors measured against them. */
import { brands, competitors } from "@workspace/lib/db/schema";
import { z } from "zod";
import { pageEnvelope } from "@/lib/api/analytics-range";
import { brandScopeCondition, requireBrandInScope } from "@/lib/api/scope";
import { listCompetitors } from "@/server/competitors-core";
import { buildBrandResult, listBrands } from "@/server/onboarding-core";
import { brandIdArg, defineTool, pagingArgs, pagingFrom } from "./define";

export const listBrandsTool = defineTool({
	name: "list_brands",
	title: "List brands",
	description:
		"The brands this connection tracks. Start here: every other brand-scoped tool takes an id from this list.",
	scopes: ["brands:read"],
	readOnly: true,
	input: {
		q: z.string().optional().describe("Substring match on brand name or id."),
		enabled: z.boolean().optional().describe("Restrict to brands that are or aren't being tracked."),
		...pagingArgs,
	},
	run: async ({ auth }, args) => {
		const { limit, offset, page } = pagingFrom(args);
		const { data, total } = await listBrands({
			scope: await brandScopeCondition(auth, brands.id),
			q: args.q,
			enabled: args.enabled,
			limit,
			offset,
		});
		return { data, pagination: pageEnvelope(page, limit, total) };
	},
});

export const getBrand = defineTool({
	name: "get_brand",
	title: "Get one brand",
	description: "One brand's configuration: its domains, aliases, tracked platforms, and cadence.",
	scopes: ["brands:read"],
	readOnly: true,
	input: { brandId: brandIdArg },
	run: async ({ auth }, args) => buildBrandResult(await requireBrandInScope(auth, args.brandId)),
});

export const listCompetitorsTool = defineTool({
	name: "list_competitors",
	title: "List competitors",
	description:
		"The competitors tracked against a brand, with the domains and aliases a mention is matched on. These are what share of voice is measured against.",
	scopes: ["competitors:read"],
	readOnly: true,
	input: {
		brandId: brandIdArg,
		q: z.string().optional().describe("Substring match on the competitor name."),
		...pagingArgs,
	},
	run: async ({ auth }, args) => {
		const brand = await requireBrandInScope(auth, args.brandId);
		const { limit, offset, page } = pagingFrom(args);
		const { data, total } = await listCompetitors({
			scope: await brandScopeCondition(auth, competitors.brandId),
			brandId: brand.id,
			q: args.q,
			limit,
			offset,
		});
		return { brandId: brand.id, data, pagination: pageEnvelope(page, limit, total) };
	},
});
