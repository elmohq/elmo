let _mockBrand: any = null;
let _mockCompetitors: any[] = [];

export function setMockBrand(brand: any) {
	_mockBrand = brand;
}

export function setMockCompetitors(competitors: any[]) {
	_mockCompetitors = competitors;
}

export type BrandWithPromptsAndDataInfo = any;

export const brandKeys = {
	all: ["brands"] as const,
	detail: (brandId: string) => ["brands", "detail", brandId] as const,
	competitors: (brandId: string) => ["brands", "competitors", brandId] as const,
};

export function useBrand(_brandId?: string) {
	return {
		data: _mockBrand,
		isLoading: false,
		error: null,
		refetch: async () => {},
	};
}

export function useCompetitors(_brandId?: string) {
	return {
		data: _mockCompetitors,
		isLoading: false,
		error: null,
		refetch: async () => {},
	};
}
