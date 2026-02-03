"use client";

import { useState } from "react";
import { IconExternalLink, IconChevronDown, IconLoader2 } from "@tabler/icons-react";
import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from "@workspace/ui/components/dropdown-menu";
import { generateOptimizationUrl } from "../config";

type ModelType = "openai" | "anthropic" | "google" | "all";
type LookbackPeriod = "1w" | "1m" | "3m" | "6m" | "1y" | "all";

interface WebQueryResponse {
	webQuery: string | null;
	modelWebQueries: Record<string, string>;
}

export interface OptimizeButtonProps {
	brandId?: string;
	selectedModel?: ModelType;
	availableModels?: ("openai" | "anthropic" | "google")[];
	lookback?: LookbackPeriod;
	promptName?: string;
	promptId?: string;
	parentName: string;
	optimizationUrlTemplate: string;
}

function getModelDisplayName(model: string): string {
	switch (model) {
		case "openai": return "ChatGPT";
		case "anthropic": return "Claude";
		case "google": return "Gemini";
		default: return model;
	}
}

async function fetchWebQuery(
	brandId: string, 
	promptId: string, 
	lookback: LookbackPeriod,
	modelGroup?: string,
): Promise<WebQueryResponse> {
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const params = new URLSearchParams({
		timezone,
		lookback,
	});
	if (modelGroup) {
		params.append("modelGroup", modelGroup);
	}
	
	const response = await fetch(
		`/api/brands/${brandId}/prompts/${promptId}/web-query?${params.toString()}`
	);
	
	if (!response.ok) {
		throw new Error("Failed to fetch web query");
	}
	
	return response.json();
}

export function OptimizeButton({
	brandId,
	selectedModel = "all",
	availableModels = ["openai", "anthropic", "google"],
	lookback = "1m",
	promptName,
	promptId,
	parentName,
	optimizationUrlTemplate,
}: OptimizeButtonProps) {
	const [loadingKey, setLoadingKey] = useState<string | null>(null);

	if (!promptName || !promptId || !brandId) {
		return null;
	}

	const handleOptimizeClick = async (
		e: React.MouseEvent,
		model?: string,
	) => {
		e.preventDefault();

		const key = `${model || 'all'}-${promptId}`;
		setLoadingKey(key);

		try {
			const webQueryData = await fetchWebQuery(brandId, promptId, lookback, model);
			
			const webQuery = model 
				? webQueryData.modelWebQueries[model]
				: webQueryData.webQuery;
			
			const url = generateOptimizationUrl(
				optimizationUrlTemplate, 
				promptName, 
				brandId, 
				!!webQuery,
				webQuery || undefined
			);
			
			window.open(url, "_blank", "noopener,noreferrer");
		} catch (error) {
			console.error("Failed to fetch web query:", error);
			const url = generateOptimizationUrl(
				optimizationUrlTemplate, 
				promptName, 
				brandId, 
				false,
				undefined
			);
			window.open(url, "_blank", "noopener,noreferrer");
		} finally {
			setLoadingKey(null);
		}
	};

	const isLoading = (model: string | undefined) => {
		return loadingKey === `${model || 'all'}-${promptId}`;
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
				{loading && <IconLoader2 size={12} className="size-3 mr-0.5 animate-spin" />}
				Optimize with {parentName}
				<IconExternalLink size={12} className="size-3 ml-0.5" />
			</Button>
		);
	}

	// Dropdown for "all" model selection - shows options for each model
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button size="sm" className="text-xs cursor-pointer p-0 m-0 h-6">
					Optimize with {parentName}
					<IconChevronDown size={12} className="size-3 ml-0.5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				{availableModels.map((model, index) => {
					const modelName = getModelDisplayName(model);
					const loading = isLoading(model);
					return (
						<div key={model}>
							{index > 0 && <DropdownMenuSeparator />}
							<DropdownMenuLabel>Optimize for {modelName}</DropdownMenuLabel>
							<DropdownMenuItem 
								className="cursor-pointer"
								onClick={(e) => handleOptimizeClick(e, model)}
								disabled={loading}
							>
								<div className="flex items-center justify-between w-full text-xs">
									<span>{promptName}</span>
									{loading ? (
										<IconLoader2 size={12} className="size-3 ml-2 animate-spin" />
									) : (
										<IconExternalLink size={12} className="size-3 ml-2" />
									)}
								</div>
							</DropdownMenuItem>
						</div>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
