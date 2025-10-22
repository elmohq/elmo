"use client";

import { Download } from "lucide-react";
import { Button } from "./ui/button";
import { ChartFooter } from "./chart-footer";
import { HistoryButton } from "./history-button";
import { OptimizeButton } from "./optimize-button";

interface ChartActionsFooterProps {
	// For single prompts
	promptId?: string;
	promptName?: string;
	brandId?: string;
	brandName?: string;
	
	// For groups
	prompts?: Array<{ id: string; value: string }>;
	groupPrefix?: string;
	groupName?: string;
	
	// For export
	onDownload?: () => void;
	isDownloading?: boolean;
	
	// For optimization
	webSearchEnabled?: boolean;
	selectedModel?: "openai" | "anthropic" | "google" | "all";
	availableModels?: ("openai" | "anthropic" | "google")[];
	webQueryMapping?: Record<string, string>;
	modelWebQueryMappings?: Record<string, Record<string, string>>;
}

export function ChartActionsFooter({ 
	promptId, 
	promptName,
	brandId, 
	brandName,
	prompts, 
	groupPrefix,
	groupName,
	onDownload,
	isDownloading = false,
	webSearchEnabled,
	selectedModel = "all",
	availableModels = ["openai", "anthropic", "google"],
	webQueryMapping = {},
	modelWebQueryMappings = {},
}: ChartActionsFooterProps) {
	const isSinglePrompt = Boolean(promptId && brandId);
	const isGroup = Boolean(prompts && prompts.length > 0);

	// For single prompts
	if (isSinglePrompt) {
		return (
			<ChartFooter>
				<div className="flex items-center justify-between w-full">
					<div className="flex items-center gap-2">
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
						webSearchEnabled={webSearchEnabled}
						selectedModel={selectedModel}
						availableModels={availableModels}
						webQueryMapping={webQueryMapping}
						modelWebQueryMappings={modelWebQueryMappings}
					/>
				</div>
			</ChartFooter>
		);
	}

	// For groups
	if (isGroup && prompts && prompts.length > 0) {
		return (
			<ChartFooter>
				<div className="flex items-center justify-between w-full">
					<div className="flex items-center gap-2">
						<HistoryButton
							brandId={brandId}
							groupName={groupName}
							groupPrefix={groupPrefix}
							prompts={prompts}
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
						brandId={brandId}
						groupName={groupName}
						groupPrefix={groupPrefix}
						prompts={prompts}
						webSearchEnabled={webSearchEnabled}
						selectedModel={selectedModel}
						availableModels={availableModels}
						webQueryMapping={webQueryMapping}
						modelWebQueryMappings={modelWebQueryMappings}
					/>
				</div>
			</ChartFooter>
		);
	}

	return null;
}
