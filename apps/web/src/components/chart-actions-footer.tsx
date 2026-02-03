"use client";

import { Download } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { ChartFooter } from "./chart-footer";
import { HistoryButton } from "./history-button";
import { OptimizeButton } from "@workspace/whitelabel/components/optimize-button";
import { clientConfig } from "@/lib/config/client";

type LookbackPeriod = "1w" | "1m" | "3m" | "6m" | "1y" | "all";

interface ChartActionsFooterProps {
	promptId?: string;
	promptName?: string;
	brandId?: string;
	
	// For export
	onDownload?: () => void;
	isDownloading?: boolean;
	
	// For optimization
	selectedModel?: "openai" | "anthropic" | "google" | "all";
	availableModels?: ("openai" | "anthropic" | "google")[];
	lookback?: LookbackPeriod;
}

export function ChartActionsFooter({ 
	promptId, 
	promptName,
	brandId, 
	onDownload,
	isDownloading = false,
	selectedModel = "all",
	availableModels = ["openai", "anthropic", "google"],
	lookback = "1m",
}: ChartActionsFooterProps) {
	const isSinglePrompt = Boolean(promptId && brandId);
	
	// Get branding from client config for OptimizeButton
	const { parentName, optimizationUrlTemplate } = clientConfig.branding;

	if (!isSinglePrompt) {
		return null;
	}

	return (
		<ChartFooter>
			<div className="flex flex-wrap items-center justify-between gap-2 w-full">
				<div className="flex flex-wrap items-center gap-2">
					<HistoryButton
						promptName={promptName}
						promptId={promptId}
						brandId={brandId}
					/>
					{onDownload && (
						<Button
							onClick={onDownload}
							disabled={isDownloading}
							size="sm"
							variant="secondary"
							className="text-xs cursor-pointer h-6 flex items-center px-2"
							title="Download chart as PNG"
						>
							<Download className="size-3 mr-0.5" />
							<span className="text-xs font-normal">{isDownloading ? "Exporting..." : "Export (PNG)"}</span>
						</Button>
					)}
				</div>
				<OptimizeButton
					promptName={promptName}
					promptId={promptId}
					brandId={brandId}
					selectedModel={selectedModel}
					availableModels={availableModels}
					lookback={lookback}
					parentName={parentName ?? ""}
					optimizationUrlTemplate={optimizationUrlTemplate ?? ""}
				/>
			</div>
		</ChartFooter>
	);
}
