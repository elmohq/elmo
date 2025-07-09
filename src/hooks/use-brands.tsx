"use client";

import useSWR from "swr";
import { usePathname } from "next/navigation";
import type { Brand } from "@/lib/db/schema";

const fetcher = async (url: string): Promise<Brand[]> => {
	const response = await fetch(url);
	
	if (!response.ok) {
		const error = new Error("Failed to fetch brands");
		error.message = `${response.status}: ${response.statusText}`;
		throw error;
	}
	
	return response.json();
};

const singleBrandFetcher = async (url: string): Promise<Brand> => {
	const response = await fetch(url);
	
	if (!response.ok) {
		const error = new Error("Failed to fetch brand");
		error.message = `${response.status}: ${response.statusText}`;
		throw error;
	}
	
	return response.json();
};

export function useBrands() {
	const { data, error, isLoading, mutate } = useSWR<Brand[]>(
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

	const { data, error, isLoading, mutate } = useSWR<Brand>(
		extractedBrandId ? `/api/brands/${extractedBrandId}` : null,
		singleBrandFetcher,
		{
			revalidateOnFocus: true,
			revalidateOnReconnect: true,
			dedupingInterval: 30000, // 30 seconds deduping
		}
	);

	return {
		brand: data,
		isLoading,
		isError: error,
		revalidate: mutate,
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
