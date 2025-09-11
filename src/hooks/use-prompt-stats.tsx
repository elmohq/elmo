"use client";

import useSWR from "swr";
import type { PromptStatsResponse } from "@/app/api/prompts/[promptId]/stats/route";

interface UsePromptStatsOptions {
	days?: number; // Number of days to look back (default: 7)
}

const fetcher = async (url: string): Promise<PromptStatsResponse> => {
	const response = await fetch(url);

	if (!response.ok) {
		const error = new Error("Failed to fetch prompt stats");
		error.message = `${response.status}: ${response.statusText}`;
		throw error;
	}

	return response.json();
};

function buildApiUrl(promptId: string, options: UsePromptStatsOptions = {}): string {
	const { days = 7 } = options;
	const params = new URLSearchParams({
		days: days.toString()
	});

	return `/api/prompts/${promptId}/stats?${params.toString()}`;
}

export function usePromptStats(promptId: string, options: UsePromptStatsOptions = {}) {
	const apiUrl = promptId ? buildApiUrl(promptId, options) : null;

	const { data, error, isLoading, mutate } = useSWR<PromptStatsResponse>(apiUrl, fetcher, {
		revalidateOnFocus: false,
		revalidateOnReconnect: true,
		refreshInterval: 60000, // Refresh every 60 seconds 
		dedupingInterval: 60000, // 1 minute deduping - stats don't change often
	});

	return {
		data,
		isLoading,
		isError: error,
		revalidate: mutate,
		// Convenience accessors
		prompt: data?.prompt,
		aggregations: data?.aggregations,
	};
}
