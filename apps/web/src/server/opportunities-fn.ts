/**
 * Its own module so the client graph resolves only this wrapper: a server
 * function's body is stripped on the way to the browser, and the pipeline behind
 * it never has to be browser-safe.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { type OpportunitiesResponse, refreshOpportunities, resolveOpportunities } from "@/server/opportunities";

const opportunitiesInput = z.object({ brandId: z.string(), timezone: z.string().default("UTC") });

export const getOpportunitiesFn = createServerFn({ method: "GET" })
	.validator(opportunitiesInput)
	.handler(async ({ data }): Promise<OpportunitiesResponse> => {
		await requireBrandSession(data.brandId);
		return await resolveOpportunities(data.brandId, data.timezone);
	});

export const refreshOpportunitiesFn = createServerFn({ method: "POST" })
	.validator(opportunitiesInput)
	.handler(async ({ data }): Promise<OpportunitiesResponse> => {
		await requireBrandSession(data.brandId);
		return await refreshOpportunities(data.brandId, data.timezone);
	});
