"use client";

import useSWR from "swr";
import { usePathname } from "next/navigation";
import type { FilteredVisibilityResponse } from "@/app/api/brands/[id]/filtered-visibility/route";

export type LookbackPeriod = "1w" | "1m" | "3m" | "6m" | "1y" | "all";

export interface FilteredVisibilityFilters {
	lookback?: LookbackPeriod;
	promptIds?: string[]; // Specific prompt IDs to calculate visibility for
	modelGroup?: string; // Filter by model group (openai, anthropic, google)
}

const fetcher = async (url: string): Promise<FilteredVisibilityResponse> => {
	const response = await fetch(url);

	if (!response.ok) {
		const error = new Error("Failed to fetch filtered visibility");
		error.message = `${response.status}: ${response.statusText}`;
		throw error;
	}

	return response.json();
};

function buildApiUrl(brandId: string, filters?: FilteredVisibilityFilters): string {
	const baseUrl = `/api/brands/${brandId}/filtered-visibility`;

	if (!filters) {
		return baseUrl;
	}

	const params = new URLSearchParams();

	if (filters.lookback) {
		params.append("lookback", filters.lookback);
	}

	if (filters.promptIds && filters.promptIds.length > 0) {
		params.append("promptIds", filters.promptIds.join(","));
	}

	if (filters.modelGroup) {
		params.append("modelGroup", filters.modelGroup);
	}

	return params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
}

export function useFilteredVisibility(brandId?: string, filters?: FilteredVisibilityFilters) {
	const pathname = usePathname();

	const extractedBrandId =
		brandId ||
		(() => {
			const segments = pathname.split("/");
			return segments[1] === "app" && segments[2] ? segments[2] : undefined;
		})();

	const apiUrl = extractedBrandId ? buildApiUrl(extractedBrandId, filters) : null;

	const { data, error, isLoading, isValidating, mutate } = useSWR<FilteredVisibilityResponse>(apiUrl, fetcher, {
		revalidateOnFocus: true,
		revalidateOnReconnect: true,
		refreshInterval: 60000,
		dedupingInterval: 30000,
		keepPreviousData: true, // Keep showing old data while fetching new data on filter changes
	});

	return {
		filteredVisibility: data,
		isLoading,
		isValidating, // True when fetching (including revalidations) - use for subtle loading indicators
		isError: error,
		revalidate: mutate,
	};
}

