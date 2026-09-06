/**
 * Its own module so the client graph resolves only this wrapper: a server
 * function's body is stripped on the way to the browser, and the pipeline behind
 * it never has to be browser-safe.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { type OpportunitiesResponse, resolveOpportunities } from "@/server/opportunities";

export const getOpportunitiesFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string(), timezone: z.string().default("UTC") }))
	.handler(async ({ data }): Promise<OpportunitiesResponse> => {
		await requireBrandSession(data.brandId);
		return await resolveOpportunities(data.brandId, data.timezone);
	});
