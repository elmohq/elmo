"use client";

import useSWR from "swr";
import { usePathname } from "next/navigation";
import type { PromptRun } from "@/lib/db/schema";

export type LookbackPeriod = "1w" | "1m" | "3m" | "6m" | "1y" | "all";

export interface PromptRunsFilters {
	from?: Date;
	to?: Date;
	lookback?: LookbackPeriod;
	webSearchEnabled?: boolean;
	modelGroup?: "openai" | "anthropic" | "google";
}

const fetcher = async (url: string): Promise<PromptRun[]> => {
	const response = await fetch(url);

	if (!response.ok) {
		const error = new Error("Failed to fetch prompt runs");
		error.message = `${response.status}: ${response.statusText}`;
		throw error;
	}

	return response.json();
};

function buildApiUrl(brandId: string, filters?: PromptRunsFilters): string {
	const baseUrl = `/api/brands/${brandId}/prompt-runs`;

	if (!filters) {
		return baseUrl;
	}

	const params = new URLSearchParams();

	if (filters.lookback) {
		params.append("lookback", filters.lookback);
	} else {
		if (filters.from) {
			params.append("from", filters.from.toISOString());
		}
		if (filters.to) {
			params.append("to", filters.to.toISOString());
		}
	}

	if (filters.webSearchEnabled !== undefined) {
		params.append("webSearchEnabled", filters.webSearchEnabled.toString());
	}

	if (filters.modelGroup) {
		params.append("modelGroup", filters.modelGroup);
	}

	return params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
}

export function usePromptRuns(brandId?: string, filters?: PromptRunsFilters) {
	const pathname = usePathname();

	const extractedBrandId =
		brandId ||
		(() => {
			const segments = pathname.split("/");
			return segments[1] === "app" && segments[2] ? segments[2] : undefined;
		})();

	const apiUrl = extractedBrandId ? buildApiUrl(extractedBrandId, filters) : null;

	const { data, error, isLoading, mutate } = useSWR<PromptRun[]>(apiUrl, fetcher, {
		revalidateOnFocus: true,
		revalidateOnReconnect: true,
		refreshInterval: 30000, // Refresh every 30 seconds
		dedupingInterval: 10000, // 10 seconds deduping
	});

	return {
		promptRuns: data,
		isLoading,
		isError: error,
		revalidate: mutate,
	};
}

// Convenience hooks for common lookback periods
export function usePromptRunsLastWeek(brandId?: string) {
	return usePromptRuns(brandId, { lookback: "1w" });
}

export function usePromptRunsLastMonth(brandId?: string) {
	return usePromptRuns(brandId, { lookback: "1m" });
}

export function usePromptRunsLast3Months(brandId?: string) {
	return usePromptRuns(brandId, { lookback: "3m" });
}

export function usePromptRunsLast6Months(brandId?: string) {
	return usePromptRuns(brandId, { lookback: "6m" });
}

export function usePromptRunsLastYear(brandId?: string) {
	return usePromptRuns(brandId, { lookback: "1y" });
}

export function useAllPromptRuns(brandId?: string) {
	return usePromptRuns(brandId, { lookback: "all" });
}

// Hook for custom date ranges
export function usePromptRunsDateRange(brandId?: string, from?: Date, to?: Date) {
	return usePromptRuns(brandId, { from, to });
}

// Hooks for filtering by web search enabled
export function usePromptRunsWithWebSearch(brandId?: string, filters?: Omit<PromptRunsFilters, "webSearchEnabled">) {
	return usePromptRuns(brandId, { ...filters, webSearchEnabled: true });
}

export function usePromptRunsWithoutWebSearch(brandId?: string, filters?: Omit<PromptRunsFilters, "webSearchEnabled">) {
	return usePromptRuns(brandId, { ...filters, webSearchEnabled: false });
}
