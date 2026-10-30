/**
 * Overview data for Storybook stories, which the brand-data client mock
 * answers with. Stories set it via setMockDashboardSummary().
 */ import type { DashboardSummaryResponse } from "@/lib/analytics/pages/dashboard";

export type { DashboardSummaryResponse } from "@/lib/analytics/pages/dashboard";

let _summary: DashboardSummaryResponse | null = null;

export function setMockDashboardSummary(summary: DashboardSummaryResponse) {
	_summary = summary;
}

export const getDashboardSummaryFn = async (..._args: unknown[]) => _summary;
