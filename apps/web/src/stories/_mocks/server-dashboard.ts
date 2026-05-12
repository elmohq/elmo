/**
 * Mock for @/server/dashboard used in Storybook stories. The real module
 * imports pg via @workspace/lib/db, which is not browser-safe.
 */

export interface VisibilityTimeSeriesPoint {
	date: string;
	value: number;
}

export interface CitationTimeSeriesPoint {
	date: string;
	value: number;
}

export interface DashboardSummaryResponse {
	visibility: VisibilityTimeSeriesPoint[];
	citations: CitationTimeSeriesPoint[];
}

export const getDashboardSummaryFn = async (..._args: unknown[]) => undefined;
