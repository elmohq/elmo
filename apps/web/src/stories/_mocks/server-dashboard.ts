/**
 * Mock for @/server/dashboard used in Storybook stories. The real module
 * imports pg via @workspace/lib/db, which is not browser-safe. The types come
 * from it all the same — `import type` is erased before Storybook's alias
 * redirects the module, so a story can't drift from the real response shape.
 *
 * Stories set the summary via setMockDashboardSummary(); getDashboardSummaryFn
 * (called by the real useDashboardSummary hook through react-query) returns it.
 */
import type { DashboardSummaryResponse } from "@/server/dashboard";

export type { CitationTimeSeriesPoint, DashboardSummaryResponse, VisibilityTimeSeriesPoint } from "@/server/dashboard";

let _summary: DashboardSummaryResponse | null = null;

export function setMockDashboardSummary(summary: DashboardSummaryResponse) {
	_summary = summary;
}

export const getDashboardSummaryFn = async (..._args: unknown[]) => _summary;
