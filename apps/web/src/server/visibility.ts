/** Server functions for visibility and chart data. */
import { createServerFn } from "@tanstack/react-start";
import {
	type BatchChartDataResponse,
	computeBatchChartData,
	computeFilteredVisibility,
	type FilteredVisibilityResponse,
	visibilityInput,
} from "@/lib/analytics/pages/visibility";
import { requireBrandSession } from "@/lib/auth/helpers";

export type { BatchChartDataResponse, FilteredVisibilityResponse } from "@/lib/analytics/pages/visibility";

export const getBatchChartDataFn = createServerFn({ method: "GET" })
	.validator(visibilityInput)
	.handler(async ({ data }): Promise<BatchChartDataResponse> => {
		await requireBrandSession(data.brandId);
		return computeBatchChartData(data);
	});

export const getFilteredVisibilityFn = createServerFn({ method: "GET" })
	.validator(visibilityInput)
	.handler(async ({ data }): Promise<FilteredVisibilityResponse> => {
		await requireBrandSession(data.brandId);
		return computeFilteredVisibility(data);
	});
