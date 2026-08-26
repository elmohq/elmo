"use client";

import { IconChevronDown, IconExternalLink } from "@tabler/icons-react";
import { labelForModelFilter } from "@workspace/config/model-filter";
import type { OptimizeButtonProps } from "@workspace/config/types";
import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Spinner } from "@workspace/ui/components/spinner";
import { Fragment, useState } from "react";

export type { OptimizeButtonProps };

/**
 * Generate optimization URL for a prompt using template substitution
 *
 * Template placeholders:
 * - {brandId} - Organization/brand ID
 * - {prompt} - The prompt text (URL encoded)
 * - {webQuery} - The search query (URL encoded); callers pass the prompt
 *   itself when no genuine query is known
 */
function generateOptimizationUrl(urlTemplate: string, promptValue: string, brandId: string, webQuery: string): string {
	return urlTemplate
		.replace("{brandId}", encodeURIComponent(brandId))
		.replace("{prompt}", encodeURIComponent(promptValue))
		.replace("{webQuery}", encodeURIComponent(webQuery));
}

export function OptimizeButton({
	brandId,
	selectedModel = "all",
	availableModels,
	lookback = "1m",
	promptName,
	promptId,
	parentName,
	optimizationUrlTemplate,
	fetchWebQuery,
}: OptimizeButtonProps) {
	const [loadingKey, setLoadingKey] = useState<string | null>(null);

	if (!promptName || !promptId || !brandId || !parentName || !optimizationUrlTemplate) {
		return null;
	}

	const handleOptimizeClick = async (e: React.MouseEvent, model?: string) => {
		e.preventDefault();

		const key = `${model || "all"}-${promptId}`;
		setLoadingKey(key);

		try {
			const modelWebQuery = await fetchWebQuery?.(promptId, lookback ?? "1m", model);

			const url = generateOptimizationUrl(
				optimizationUrlTemplate,
				promptName,
				brandId,
				// No genuine search query known (the engine searched the prompt
				// verbatim or doesn't expose its queries) — the prompt itself is
				// the best stand-in.
				modelWebQuery?.webQuery || promptName,
			);

			window.open(url, "_blank", "noopener,noreferrer");
		} catch (error) {
			console.error("Failed to fetch web query:", error);
			const url = generateOptimizationUrl(optimizationUrlTemplate, promptName, brandId, promptName);
			window.open(url, "_blank", "noopener,noreferrer");
		} finally {
			setLoadingKey(null);
		}
	};

	const isLoading = (model: string | undefined) => {
		return loadingKey === `${model || "all"}-${promptId}`;
	};

	// Simple button for single model selection
	if (selectedModel !== "all") {
		const loading = isLoading(selectedModel);
		return (
			<Button
				size="sm"
				className="text-xs cursor-pointer p-0 m-0 h-6"
				onClick={(e) => handleOptimizeClick(e, selectedModel)}
				disabled={loading}
			>
				{loading && <Spinner className="mr-0.5 size-3" />}
				Optimize with {parentName}
				<IconExternalLink size={12} className="size-3 ml-0.5" />
			</Button>
		);
	}

	// Dropdown for "all" model selection - shows options for each model
	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button size="sm" className="text-xs cursor-pointer p-0 m-0 h-6" />}>
				Optimize with {parentName}
				<IconChevronDown size={12} className="size-3 ml-0.5" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				{availableModels.map((model, index) => {
					const modelName = labelForModelFilter(model);
					const loading = isLoading(model);
					return (
						<Fragment key={model}>
							{index > 0 && <DropdownMenuSeparator />}
							{/* The label names the entry below it, and Base UI wires that
							    association through the group, so it has to sit inside one. */}
							<DropdownMenuGroup>
								<DropdownMenuLabel>Optimize for {modelName}</DropdownMenuLabel>
								<DropdownMenuItem
									className="cursor-pointer"
									onClick={(e) => handleOptimizeClick(e, model)}
									disabled={loading}
								>
									<div className="flex items-center justify-between w-full text-xs">
										<span>{promptName}</span>
										{loading ? (
											<Spinner className="ml-2 size-3" />
										) : (
											<IconExternalLink size={12} className="size-3 ml-2" />
										)}
									</div>
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</Fragment>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
