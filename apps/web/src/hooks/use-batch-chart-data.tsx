"use client";

import useSWR from "swr";
import { usePathname } from "next/navigation";
import type { BatchChartDataResponse } from "@/app/api/brands/[id]/batch-chart-data/route";

export type LookbackPeriod = "1w" | "1m" | "3m" | "6m" | "1y" | "all";

export interface BatchChartDataFilters {
	lookback?: LookbackPeriod;
	modelGroup?: "openai" | "anthropic" | "google";
	promptIds: string[];
}

const fetcher = async (url: string): Promise<BatchChartDataResponse> => {
	const response = await fetch(url);

	if (!response.ok) {
		const error = new Error("Failed to fetch batch chart data");
		error.message = `${response.status}: ${response.statusText}`;
		throw error;
	}

	return response.json();
};

function buildApiUrl(brandId: string, filters: BatchChartDataFilters): string | null {
	// Don't fetch if no prompt IDs
	if (!filters.promptIds || filters.promptIds.length === 0) {
		return null;
	}

	const baseUrl = `/api/brands/${brandId}/batch-chart-data`;
	const params = new URLSearchParams();

	// Always include client timezone
	params.append("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);

	if (filters.lookback) {
		params.append("lookback", filters.lookback);
	}

	if (filters.modelGroup) {
		params.append("modelGroup", filters.modelGroup);
	}

	// Pass prompt IDs as comma-separated list
	params.append("promptIds", filters.promptIds.join(","));

	return `${baseUrl}?${params.toString()}`;
}

export function useBatchChartData(brandId?: string, filters?: BatchChartDataFilters) {
	const pathname = usePathname();

	const extractedBrandId =
		brandId ||
		(() => {
			const segments = pathname.split("/");
			return segments[1] === "app" && segments[2] ? segments[2] : undefined;
		})();

	const apiUrl = extractedBrandId && filters?.promptIds?.length 
		? buildApiUrl(extractedBrandId, filters) 
		: null;

	const { data, error, isLoading, isValidating, mutate } = useSWR<BatchChartDataResponse>(apiUrl, fetcher, {
		revalidateOnFocus: false, // Don't refetch when window gains focus
		revalidateOnReconnect: true,
		refreshInterval: 0, // Don't auto-refresh
		dedupingInterval: 60000, // 1 minute deduping
		keepPreviousData: true, // Keep showing old data while fetching new data on filter changes
		// Add error retry with exponential backoff
		errorRetryCount: 3,
		errorRetryInterval: 1000,
	});

	return {
		batchChartData: data,
		isLoading,
		isValidating, // True when fetching (including revalidations) - use for subtle loading indicators
		isError: error,
		revalidate: mutate,
	};
}
