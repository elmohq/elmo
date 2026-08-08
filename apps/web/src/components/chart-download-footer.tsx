import { Download } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { ChartFooter } from "./chart-footer";
import * as m from "@/paraglide/messages.js";

interface ChartDownloadFooterProps {
	onDownload: () => void;
	isDownloading: boolean;
}

export function ChartDownloadFooter({ onDownload, isDownloading }: ChartDownloadFooterProps) {
	return (
		<div className="print:hidden">
			<ChartFooter>
				<Button
					onClick={onDownload}
					disabled={isDownloading}
					size="sm"
					variant="secondary"
					className="text-xs cursor-pointer h-6 flex items-center px-2"
					title={m.chart_download_png()}
				>
					<Download className="size-3 mr-0.5" />
					<span className="text-xs font-normal">{isDownloading ? m.chart_exporting() : m.chart_export_png()}</span>
				</Button>
			</ChartFooter>
		</div>
	);
}
