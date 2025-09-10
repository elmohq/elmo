"use client";

import useSWR from "swr";
import { usePathname } from "next/navigation";

export type LookbackPeriod = "1w" | "1m" | "3m" | "6m" | "1y" | "all";

export interface PromptChartDataFilters {
	lookback?: LookbackPeriod;
	webSearchEnabled?: boolean;
	modelGroup?: "openai" | "anthropic" | "google";
}

export interface PromptChartDataResponse {
	prompt: {
		id: string;
		value: string;
		groupCategory: string | null;
		groupPrefix: string | null;
	};
	chartData: Array<{
		date: string;
		[key: string]: number | string | null;
	}>;
	brand: any;
	competitors: any[];
	totalRuns: number;
	hasVisibilityData: boolean;
	lastBrandVisibility: number | null;
}

const fetcher = async (url: string): Promise<PromptChartDataResponse> => {
	const response = await fetch(url, {
		// Add cache headers for better performance
		headers: {
			'Cache-Control': 'public, max-age=300', // 5 minutes browser cache
		}
	});

	if (!response.ok) {
		const error = new Error("Failed to fetch prompt chart data");
		error.message = `${response.status}: ${response.statusText}`;
		throw error;
	}

	return response.json();
};

function buildApiUrl(brandId: string, promptId: string, filters?: PromptChartDataFilters): string {
	// Use the optimized endpoint for better performance
	const baseUrl = `/api/brands/${brandId}/prompts/${promptId}/chart-data`;

	if (!filters) {
		return baseUrl;
	}

	const params = new URLSearchParams();

	if (filters.lookback) {
		params.append("lookback", filters.lookback);
	}

	if (filters.webSearchEnabled !== undefined) {
		params.append("webSearchEnabled", filters.webSearchEnabled.toString());
	}

	if (filters.modelGroup) {
		params.append("modelGroup", filters.modelGroup);
	}

	return params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
}

export function usePromptChartData(
	brandId: string | undefined,
	promptId: string,
	filters?: PromptChartDataFilters,
	enabled: boolean = true,
) {
	const pathname = usePathname();

	const extractedBrandId =
		brandId ||
		(() => {
			const segments = pathname.split("/");
			return segments[1] === "app" && segments[2] ? segments[2] : undefined;
		})();

	const apiUrl = extractedBrandId && enabled ? buildApiUrl(extractedBrandId, promptId, filters) : null;

	const { data, error, isLoading, mutate } = useSWR<PromptChartDataResponse>(apiUrl, fetcher, {
		revalidateOnFocus: false, // Don't refetch when window gains focus
		revalidateOnReconnect: true,
		refreshInterval: 0, // Don't auto-refresh
		dedupingInterval: 60000, // 1 minute deduping
		// Add error retry with exponential backoff
		errorRetryCount: 3,
		errorRetryInterval: 1000,
	});

	return {
		chartData: data,
		isLoading,
		isError: error,
		revalidate: mutate,
	};
}
