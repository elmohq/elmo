import { useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { getOptimizeButtonForMode } from "@workspace/deployment/client";
import { Button } from "@workspace/ui/components/button";
import { CardFooter } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Download } from "lucide-react";
import { useCallback } from "react";
import type { LookbackPeriod } from "@/lib/lookback";
import { getPromptWebQueryFn } from "@/server/prompts";
import { HistoryButton } from "./history-button";

interface ChartFooterProps {
	children: React.ReactNode;
	className?: string;
}

function ChartFooter({ children, className = "" }: ChartFooterProps) {
	return (
		<>
			<Separator className="py-0 my-0" />
			<CardFooter className={`flex justify-between items-center px-3 pt-3 pb-0 ${className}`}>{children}</CardFooter>
		</>
	);
}

function DownloadButton({ onDownload, isDownloading }: { onDownload: () => void; isDownloading: boolean }) {
	return (
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
	);
}

export function ChartDownloadFooter({ onDownload, isDownloading }: { onDownload: () => void; isDownloading: boolean }) {
	return (
		<div className="print:hidden">
			<ChartFooter>
				<DownloadButton onDownload={onDownload} isDownloading={isDownloading} />
			</ChartFooter>
		</div>
	);
}

interface ChartActionsFooterProps {
	promptId?: string;
	promptName?: string;
	brandId?: string;

	onDownload?: () => void;
	isDownloading?: boolean;

	selectedModel?: string;
	availableModels: string[];
	lookback?: LookbackPeriod;
}

export function ChartActionsFooter({
	promptId,
	promptName,
	brandId,
	onDownload,
	isDownloading = false,
	selectedModel = "all",
	availableModels,
	lookback = "1m",
}: ChartActionsFooterProps) {
	const isSinglePrompt = Boolean(promptId && brandId);

	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const mode = context.clientConfig?.mode ?? "local";
	const showOptimizeButton = context.clientConfig?.features.showOptimizeButton ?? false;
	const { parentName, optimizationUrlTemplate } = context.clientConfig?.branding ?? {};
	const OptimizeButton = getOptimizeButtonForMode(mode);

	const fetchWebQuery = useCallback(
		async (pId: string, lb: string, model?: string) => {
			if (!brandId) throw new Error("No brand ID");
			return getPromptWebQueryFn({
				data: {
					brandId,
					promptId: pId,
					lookback: lb,
					model,
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				},
			});
		},
		[brandId],
	);

	if (!isSinglePrompt) {
		return null;
	}

	return (
		<ChartFooter>
			<div className="flex flex-wrap items-center justify-between gap-2 w-full">
				<div className="flex flex-wrap items-center gap-2">
					<HistoryButton promptId={promptId} />
					{onDownload && <DownloadButton onDownload={onDownload} isDownloading={isDownloading} />}
				</div>
				{showOptimizeButton && (
					<OptimizeButton
						promptName={promptName}
						promptId={promptId}
						brandId={brandId}
						selectedModel={selectedModel}
						availableModels={availableModels}
						lookback={lookback}
						parentName={parentName ?? ""}
						optimizationUrlTemplate={optimizationUrlTemplate ?? ""}
						fetchWebQuery={fetchWebQuery}
					/>
				)}
			</div>
		</ChartFooter>
	);
}
