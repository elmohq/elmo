/**
 * The dashboard's entry point to the Opportunities report.
 *
 * Deliberately its own module: `@/server/opportunities` builds the digest from
 * the database and calls a provider, and the hook that reaches this file is
 * client code. A server function's body is stripped on the way to the browser,
 * so this thin wrapper is the only thing the client graph resolves, and the
 * pipeline behind it never has to be browser-safe.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthSession, requireBrandAccess } from "@/lib/auth/helpers";
import { type OpportunitiesResponse, resolveOpportunities } from "@/server/opportunities";

export const getOpportunitiesFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string(), timezone: z.string().default("UTC") }))
	.handler(async ({ data }): Promise<OpportunitiesResponse> => {
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);
		return await resolveOpportunities(data.brandId, data.timezone);
	});
