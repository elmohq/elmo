"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { usePathname } from "next/navigation";
import type { BrandWithPrompts } from "@/lib/db/schema";

const fetcher = async (url: string): Promise<BrandWithPrompts[]> => {
	const response = await fetch(url);
	
	if (!response.ok) {
		const error = new Error("Failed to fetch brands");
		error.message = `${response.status}: ${response.statusText}`;
		throw error;
	}
	
	return response.json();
};

const singleBrandFetcher = async (url: string): Promise<BrandWithPrompts> => {
	const response = await fetch(url);
	
	if (!response.ok) {
		const error = new Error("Failed to fetch brand");
		error.message = `${response.status}: ${response.statusText}`;
		throw error;
	}
	
	return response.json();
};

export function useBrands() {
	const { data, error, isLoading, mutate } = useSWR<BrandWithPrompts[]>(
		"/api/brands",
		fetcher,
		{
			revalidateOnFocus: true,
			revalidateOnReconnect: true,
			dedupingInterval: 30000, // 30 seconds deduping
		}
	);

	return {
		brands: data,
		isLoading,
		isError: error,
		revalidate: mutate,
	};
}

export function useBrand(brandId: string | undefined = undefined) {
	const pathname = usePathname();
	
	const extractedBrandId = brandId || (() => {
		const segments = pathname.split('/');
		return segments[1] === 'app' && segments[2] ? segments[2] : undefined;
	})();

	const { data, error, isLoading, mutate } = useSWR<BrandWithPrompts>(
		extractedBrandId ? `/api/brands/${extractedBrandId}` : null,
		singleBrandFetcher,
		{
			revalidateOnFocus: true,
			revalidateOnReconnect: true,
			dedupingInterval: 30000, // 30 seconds deduping
		}
	);

	const revalidate = async () => {
		// Revalidate the individual brand cache
		await mutate();
		// Also revalidate the brands list cache to keep them in sync
		await globalMutate("/api/brands");
	};

	return {
		brand: data,
		isLoading,
		isError: error,
		revalidate,
	};
}

// Hook for manually revalidating all brand-related cache
export function useBrandsRevalidation() {
	const { mutate: mutateBrands } = useSWR("/api/brands", fetcher);
	
	const revalidateAll = async () => {
		// Revalidate the brands list
		await mutateBrands();
		
		// Note: Individual brand cache entries will be revalidated 
		// automatically when accessed or can be done manually per brand
	};

	return {
		revalidateAll,
	};
}
