"use client";

import useSWR from "swr";
import { usePathname } from "next/navigation";
import type { PromptsSummaryResponse } from "@/app/api/brands/[id]/prompts-summary/route";

export type LookbackPeriod = "1w" | "1m" | "3m" | "6m" | "1y" | "all";

export interface PromptsSummaryFilters {
	lookback?: LookbackPeriod;
	webSearchEnabled?: boolean;
	modelGroup?: "openai" | "anthropic" | "google";
}

const fetcher = async (url: string): Promise<PromptsSummaryResponse> => {
	const response = await fetch(url);

	if (!response.ok) {
		const error = new Error("Failed to fetch prompts summary");
		error.message = `${response.status}: ${response.statusText}`;
		throw error;
	}

	return response.json();
};

function buildApiUrl(brandId: string, filters?: PromptsSummaryFilters): string {
	const baseUrl = `/api/brands/${brandId}/prompts-summary`;

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

export function usePromptsSummary(brandId?: string, filters?: PromptsSummaryFilters) {
	const pathname = usePathname();

	const extractedBrandId =
		brandId ||
		(() => {
			const segments = pathname.split("/");
			return segments[1] === "app" && segments[2] ? segments[2] : undefined;
		})();

	const apiUrl = extractedBrandId ? buildApiUrl(extractedBrandId, filters) : null;

	const { data, error, isLoading, mutate } = useSWR<PromptsSummaryResponse>(apiUrl, fetcher, {
		revalidateOnFocus: true,
		revalidateOnReconnect: true,
		refreshInterval: 60000, // Refresh every 60 seconds (less frequent than individual charts)
		dedupingInterval: 30000, // 30 seconds deduping
	});

	return {
		promptsSummary: data,
		isLoading,
		isError: error,
		revalidate: mutate,
	};
}
