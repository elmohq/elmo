"use client";

import useSWR from "swr";
import type { PromptRunsOnlyResponse } from "@/app/api/prompts/[promptId]/runs-only/route";

interface UsePromptRunsOnlyOptions {
	page?: number;
	limit?: number;
	days?: number; // Number of days to look back (default: 7)
}

const fetcher = async (url: string): Promise<PromptRunsOnlyResponse> => {
	const response = await fetch(url);

	if (!response.ok) {
		const error = new Error("Failed to fetch prompt runs");
		error.message = `${response.status}: ${response.statusText}`;
		throw error;
	}

	return response.json();
};

function buildApiUrl(promptId: string, options: UsePromptRunsOnlyOptions = {}): string {
	const { page = 1, limit = 15, days = 7 } = options;
	const params = new URLSearchParams({
		page: page.toString(),
		limit: limit.toString(),
		days: days.toString()
	});

	return `/api/prompts/${promptId}/runs-only?${params.toString()}`;
}

export function usePromptRunsOnly(promptId: string, options: UsePromptRunsOnlyOptions = {}) {
	const apiUrl = promptId ? buildApiUrl(promptId, options) : null;

	const { data, error, isLoading, mutate } = useSWR<PromptRunsOnlyResponse>(apiUrl, fetcher, {
		revalidateOnFocus: false,
		revalidateOnReconnect: true,
		refreshInterval: 0, // Don't auto-refresh
		dedupingInterval: 30000, // 30 seconds deduping
		// Keep previous data while loading new page for smooth transitions
		keepPreviousData: true,
	});

	return {
		data,
		isLoading,
		isError: error,
		revalidate: mutate,
		// Convenience accessors
		runs: data?.runs || [],
		pagination: data?.pagination,
	};
}
