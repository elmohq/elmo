/**
 * Brands, the competitors measured against them, and what the workspace is
 * paying for.
 *
 * None of these paginate. A workspace has a handful of brands and a handful of
 * competitors per brand, so a page argument would be a knob every caller has to
 * think about to get back what one call already returns.
 */
import { brands, competitors } from "@workspace/lib/db/schema";
import { z } from "zod";
import { brandScopeCondition, requireBrandInScope, requireOrganizationInScope } from "@/lib/api/scope";
import { organizationBilling } from "@/server/billing-core";
import { listCompetitors } from "@/server/competitors-core";
import { buildBrandResult, listBrands } from "@/server/onboarding-core";
import { brandIdArg, defineTool } from "./define";

/** Bounded by what a workspace can hold, not by what a caller asks for. */
const ALL_ROWS = { limit: 1000, offset: 0 };

export const listBrandsTool = defineTool({
	name: "list_brands",
	title: "List brands",
	description: "Every brand this connection tracks. Start here: the other brand tools take an id from this list.",
	scopes: ["brands:read"],
	readOnly: true,
	input: {},
	run: async ({ auth }) => {
		const { data } = await listBrands({ scope: await brandScopeCondition(auth, brands.id), ...ALL_ROWS });
		return { data };
	},
});

export const getBrand = defineTool({
	name: "get_brand",
	title: "Get one brand",
	description: "One brand's configuration: its domains, aliases, tracked models, and cadence.",
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
	input: { brandId: brandIdArg },
	run: async ({ auth }, args) => {
		const brand = await requireBrandInScope(auth, args.brandId);
		const { data } = await listCompetitors({
			scope: await brandScopeCondition(auth, competitors.brandId),
			brandId: brand.id,
			...ALL_ROWS,
		});
		return { brandId: brand.id, data };
	},
});

export const getBilling = defineTool({
	name: "get_billing",
	title: "Get plan and usage",
	description:
		"A workspace's plan, its limits, and how much of each is used. Read-only — there is no tool that changes a subscription.",
	scopes: ["billing:read"],
	readOnly: true,
	input: {
		organizationId: z.string().describe("Organization id, from the organizationIds whoami reports."),
	},
	run: async ({ auth }, args) => {
		requireOrganizationInScope(auth, args.organizationId);
		return organizationBilling(args.organizationId);
	},
});
