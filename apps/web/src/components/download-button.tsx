
import { useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Download, Loader2 } from "lucide-react";

interface DownloadButtonProps {
	reportId: string;
}

export function DownloadButton({ reportId }: DownloadButtonProps) {
	const [isDownloading, setIsDownloading] = useState(false);

	const handleDownload = async () => {
		if (isDownloading) return;

		setIsDownloading(true);
		try {
			const response = await fetch(`/api/reports/download/${reportId}`);
			if (response.ok) {
				const blob = await response.blob();
				const url = window.URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.style.display = "none";
				a.href = url;
				a.download =
					response.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || "report.pdf";
				document.body.appendChild(a);
				a.click();
				window.URL.revokeObjectURL(url);
				document.body.removeChild(a);
			} else {
				console.error("Download failed:", response.statusText);
			}
		} catch (error) {
			console.error("Download error:", error);
		} finally {
			setIsDownloading(false);
		}
	};

	return (
		<Button onClick={handleDownload} className="flex items-center gap-2" disabled={isDownloading}>
			{isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
			{isDownloading ? "Rendering..." : "Download"}
		</Button>
	);
}
