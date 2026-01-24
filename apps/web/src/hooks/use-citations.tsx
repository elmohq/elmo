"use client";

import useSWR from "swr";

export interface CitationStats {
	totalCitations: number;
	uniqueDomains: number;
	brandCitations: number;
	competitorCitations: number;
	socialMediaCitations: number;
	otherCitations: number;
	domainDistribution: {
		domain: string;
		count: number;
		category: 'brand' | 'competitor' | 'social_media' | 'other';
		exampleTitle?: string;
	}[];
	specificUrls: {
		url: string;
		title?: string;
		domain: string;
		count: number;
		category: 'brand' | 'competitor' | 'social_media' | 'other';
	}[];
	availableTags?: string[];
}

const fetcher = async (url: string): Promise<CitationStats> => {
	const response = await fetch(url);

	if (!response.ok) {
		const error = new Error("Failed to fetch citations");
		error.message = `${response.status}: ${response.statusText}`;
		throw error;
	}

	return response.json();
};

function buildApiUrl(brandId: string, options: { days?: number; tags?: string[]; modelGroup?: string }): string {
	const baseUrl = `/api/brands/${brandId}/citations`;
	const params = new URLSearchParams();

	if (options.days) {
		params.append("days", options.days.toString());
	}
	if (options.tags && options.tags.length > 0) {
		params.append("tags", options.tags.join(","));
	}
	if (options.modelGroup) {
		params.append("modelGroup", options.modelGroup);
	}

	return params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
}

export function useCitations(brandId: string, options: { days?: number; tags?: string[]; modelGroup?: string } = {}) {
	const apiUrl = brandId ? buildApiUrl(brandId, options) : null;

	const { data, error, isLoading, isValidating, mutate } = useSWR<CitationStats>(apiUrl, fetcher, {
		revalidateOnFocus: true,
		revalidateOnReconnect: true,
		refreshInterval: 60000, // Refresh every 60 seconds
		dedupingInterval: 30000, // 30 seconds deduping
		keepPreviousData: true, // Keep showing old data while fetching new data on filter changes
	});

	return {
		data,
		isLoading,
		isValidating, // True when fetching (including revalidations) - use for subtle loading indicators
		isError: error,
		revalidate: mutate,
	};
}

