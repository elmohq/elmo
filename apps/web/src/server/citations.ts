/** Server functions for citation data. */
import { createServerFn } from "@tanstack/react-start";
import {
	citationDomainsInput,
	citationFlowInput,
	citationsInput,
	citationUrlsInput,
	computeCitationDomains,
	computeCitationFlow,
	computeCitations,
	computeCitationUrls,
	computeGoogleShopping,
	googleShoppingInput,
} from "@/lib/analytics/pages/citations";
import { pgReader } from "@/lib/analytics/pg-reader";
import { requireBrandSession } from "@/lib/auth/helpers";

export type * from "@/lib/analytics/pages/citations";

export const getCitationsFn = createServerFn({ method: "GET" })
	.validator(citationsInput)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return computeCitations(pgReader, data);
	});

export const getCitationUrlsFn = createServerFn({ method: "GET" })
	.validator(citationUrlsInput)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return computeCitationUrls(pgReader, data);
	});

export const getCitationDomainsFn = createServerFn({ method: "GET" })
	.validator(citationDomainsInput)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return computeCitationDomains(pgReader, data);
	});

export const getGoogleShoppingFn = createServerFn({ method: "GET" })
	.validator(googleShoppingInput)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return computeGoogleShopping(pgReader, data);
	});

export const getCitationFlowFn = createServerFn({ method: "GET" })
	.validator(citationFlowInput)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return computeCitationFlow(pgReader, data);
	});
