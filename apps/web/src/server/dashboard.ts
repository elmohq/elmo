import { createServerFn } from "@tanstack/react-start";
import {
	computeDashboardSummary,
	type DashboardSummaryResponse,
	dashboardSummaryInput,
} from "@/lib/analytics/pages/dashboard";
import { requireBrandSession } from "@/lib/auth/helpers";

export type { DashboardSummaryResponse, OverviewCard } from "@/lib/analytics/pages/dashboard";

export const getDashboardSummaryFn = createServerFn({ method: "GET" })
	.validator(dashboardSummaryInput)
	.handler(async ({ data }): Promise<DashboardSummaryResponse> => {
		await requireBrandSession(data.brandId);
		return computeDashboardSummary(data);
	});
