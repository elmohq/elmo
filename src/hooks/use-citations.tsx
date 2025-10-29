"use client";

import { useEffect, useState } from "react";

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
	citationsByPrompt: {
		promptId: string;
		promptValue: string;
		citationCount: number;
	}[];
}

export function useCitations(brandId: string, options: { days?: number } = {}) {
	const [data, setData] = useState<CitationStats | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isError, setIsError] = useState(false);

	useEffect(() => {
		const fetchData = async () => {
			try {
				setIsLoading(true);
				setIsError(false);
				
				const params = new URLSearchParams();
				if (options.days) {
					params.append('days', options.days.toString());
				}
				
				const response = await fetch(`/api/brands/${brandId}/citations?${params.toString()}`);
				
				if (!response.ok) {
					throw new Error('Failed to fetch citations');
				}
				
				const json = await response.json();
				setData(json);
			} catch (error) {
				console.error('Error fetching citations:', error);
				setIsError(true);
			} finally {
				setIsLoading(false);
			}
		};

		if (brandId) {
			fetchData();
		}
	}, [brandId, options.days]);

	return { data, isLoading, isError };
}

