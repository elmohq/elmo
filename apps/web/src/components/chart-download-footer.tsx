import { useI18n } from "@/lib/i18n";
import { Button } from "@workspace/ui/components/button";
import { Download } from "lucide-react";
import { ChartFooter } from "./chart-footer";

interface ChartDownloadFooterProps {
	onDownload: () => void;
	isDownloading: boolean;
}

export function ChartDownloadFooter({ onDownload, isDownloading }: ChartDownloadFooterProps) {
	const { t } = useI18n();
	return (
		<div className="print:hidden">
			<ChartFooter>
				<Button
					onClick={onDownload}
					disabled={isDownloading}
					size="sm"
					variant="secondary"
					className="text-xs cursor-pointer h-6 flex items-center px-2"
					title={t("Download chart as PNG")}
				>
					<Download className="size-3 mr-0.5" />
					<span className="text-xs font-normal">{isDownloading ? t("Exporting...") : t("Export (PNG)")}</span>
				</Button>
			</ChartFooter>
		</div>
	);
}
