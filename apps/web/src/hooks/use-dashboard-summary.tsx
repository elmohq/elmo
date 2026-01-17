"use client";

import useSWR from "swr";
import { usePathname } from "next/navigation";

export type LookbackPeriod = "1w" | "1m" | "3m" | "6m" | "1y" | "all";

export interface VisibilityTimeSeriesPoint {
	date: string;
	overall: number | null;
	nonBranded: number | null;
	branded: number | null;
}

export interface CitationTimeSeriesPoint {
	date: string;
	brand: number;
	competitor: number;
	socialMedia: number;
	other: number;
}

export interface DashboardSummaryResponse {
	totalPrompts: number;
	totalRuns: number;
	averageVisibility: number;
	nonBrandedVisibility: number;
	brandedVisibility: number;
	visibilityTimeSeries: VisibilityTimeSeriesPoint[];
	citationTimeSeries: CitationTimeSeriesPoint[];
	lastUpdatedAt: string | null;
}

const fetcher = async (url: string): Promise<DashboardSummaryResponse> => {
	const response = await fetch(url);

	if (!response.ok) {
		const error = new Error("Failed to fetch dashboard summary");
		error.message = `${response.status}: ${response.statusText}`;
		throw error;
	}

	return response.json();
};

function buildApiUrl(brandId: string, lookback: LookbackPeriod = "1m"): string {
	return `/api/brands/${brandId}/dashboard-summary?lookback=${lookback}`;
}

export function useDashboardSummary(brandId?: string, lookback: LookbackPeriod = "1m") {
	const pathname = usePathname();

	const extractedBrandId =
		brandId ||
		(() => {
			const segments = pathname.split("/");
			return segments[1] === "app" && segments[2] ? segments[2] : undefined;
		})();

	const apiUrl = extractedBrandId ? buildApiUrl(extractedBrandId, lookback) : null;

	const { data, error, isLoading, mutate } = useSWR<DashboardSummaryResponse>(apiUrl, fetcher, {
		revalidateOnFocus: true,
		revalidateOnReconnect: true,
		refreshInterval: 60000, // Refresh every 60 seconds
		dedupingInterval: 30000, // 30 seconds deduping
	});

	return {
		dashboardSummary: data,
		isLoading,
		isError: error,
		revalidate: mutate,
	};
}
