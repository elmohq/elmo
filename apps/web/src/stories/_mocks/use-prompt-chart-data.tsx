/**
 * Mock for @/hooks/use-prompt-chart-data — provides controllable chart data for stories.
 */

export type LookbackPeriod = "1w" | "1m" | "3m" | "6m" | "1y" | "all";

export interface PromptChartDataFilters {
	lookback?: LookbackPeriod;
	webSearchEnabled?: boolean;
	modelGroup?: "openai" | "anthropic" | "google";
}

export interface PromptChartDataResponse {
	prompt: { id: string; value: string };
	chartData: Array<{ date: string; [key: string]: number | string | null }>;
	brand: any;
	competitors: any[];
	totalRuns: number;
	hasVisibilityData: boolean;
	lastBrandVisibility: number | null;
	webQueryMapping: Record<string, string>;
	modelWebQueryMappings: Record<string, Record<string, string>>;
}

// Module-level mock state — stories set this before rendering
let _mockState: {
	chartData: PromptChartDataResponse | undefined;
	isLoading: boolean;
	isError: any;
	revalidate: () => void;
} = {
	chartData: undefined,
	isLoading: true,
	isError: null,
	revalidate: () => {},
};

export function setMockPromptChartData(state: Partial<typeof _mockState>) {
	_mockState = { ..._mockState, ...state };
}

export function usePromptChartData(
	_brandId: string | undefined,
	_promptId: string,
	_filters?: PromptChartDataFilters,
	_enabled?: boolean,
) {
	return _mockState;
}
