import { useRef, useState } from "react";
import { useRouteContext } from "@tanstack/react-router";
import html2canvas from "html2canvas-pro";
import type { ClientConfig } from "@workspace/config/types";
import { DEFAULT_APP_NAME } from "@workspace/config/constants";

interface BrandingConfig {
	name?: string;
	url?: string;
	icon?: string;
}

function createExportBrandingElement(branding: BrandingConfig): HTMLDivElement {
	const brandingDiv = document.createElement("div");
	brandingDiv.className = "chart-export-branding";
	
	const name = branding.name || DEFAULT_APP_NAME;
	const url = branding.url || "elmohq.com";
	const displayUrl = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
	
	brandingDiv.style.cssText = `
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		padding: 12px 16px;
		border-top: 1px solid #e5e7eb;
		background: #ffffff;
		font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
	`;

	if (branding.icon) {
		const img = document.createElement("img");
		img.src = branding.icon;
		img.alt = `${name} logo`;
		img.style.cssText = "width: 16px; height: 16px; object-fit: contain;";
		brandingDiv.appendChild(img);
	}
	
	const textSpan = document.createElement("span");
	textSpan.style.cssText = `
		font-size: 12px;
		color: #6b7280;
		font-weight: 500;
	`;
	textSpan.textContent = `Powered by ${name} · ${displayUrl}`;
	brandingDiv.appendChild(textSpan);

	return brandingDiv;
}

export function useChartDownload(fileName: string) {
	const chartRef = useRef<HTMLDivElement>(null);
	const [isDownloading, setIsDownloading] = useState(false);
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const branding = context.clientConfig?.branding;

	const handleDownload = async () => {
		if (!chartRef.current || isDownloading) return;

		setIsDownloading(true);
		try {
			const canvas = await html2canvas(chartRef.current, {
				scale: 2,
				backgroundColor: "#ffffff",
				logging: false,
				onclone: (clonedDoc, clonedElement) => {
					// Remove all print:hidden elements (download footers)
					const printHiddenElements = clonedDoc.querySelectorAll(".print\\:hidden");
					printHiddenElements.forEach((el) => el.remove());

					// Remove borders and rounded corners from the card for cleaner export
					const card = clonedElement.querySelector("[data-slot='card']") || clonedElement;
					if (card instanceof HTMLElement) {
						card.style.border = "none";
						card.style.borderRadius = "0";
						card.style.boxShadow = "none";
					}

					// Add branding footer
					const brandingElement = createExportBrandingElement({
						name: branding?.name,
						url: branding?.url,
						icon: branding?.icon,
					});
					clonedElement.appendChild(brandingElement);
				},
			});

			const link = document.createElement("a");
			link.download = `${fileName}.png`;
			link.href = canvas.toDataURL("image/png");
			link.click();
		} catch (error) {
			console.error("Error downloading chart:", error);
		} finally {
			setIsDownloading(false);
		}
	};

	return { chartRef, isDownloading, handleDownload };
}
