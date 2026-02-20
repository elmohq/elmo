/**
 * Mock for @/hooks/use-chart-download — provides a no-op download handler.
 */
import { useRef } from "react";

export function useChartDownload(_fileName: string) {
	return {
		chartRef: useRef<HTMLDivElement>(null),
		isDownloading: false,
		handleDownload: async () => {
			console.log("[mock] Chart download triggered for:", _fileName);
		},
	};
}
