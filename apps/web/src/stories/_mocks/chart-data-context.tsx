import { createContext, type ReactNode, useContext } from "react";

export interface ProcessedChartData {
	chartData: Array<{ date: string; [key: string]: number | string | null }>;
	totalRuns: number;
	hasVisibilityData: boolean;
	lastBrandVisibility: number | null;
}

interface ChartDataContextValue {
	batchData: unknown[] | null;
	brand: any;
	competitors: any[];
	dateRange: string[];
	getChartDataForPrompt: (promptId: string) => ProcessedChartData | null;
	isLoading: boolean;
}

let _mockContextValue: ChartDataContextValue | null = null;

export function setMockChartDataContext(value: ChartDataContextValue | null) {
	_mockContextValue = value;
}

export function useOptionalChartDataContext() {
	return _mockContextValue;
}

export function ChartDataProvider({ children }: { children: ReactNode }) {
	return <>{children}</>;
}
