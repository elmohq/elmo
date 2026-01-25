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

interface PromptData {
	id: string;
	value: string;
}

interface WebQueryResponse {
	webQuery: string | null;
	modelWebQueries: Record<string, string>;
}

export interface OptimizeButtonProps {
	// Basic configuration
	brandId?: string;
	selectedModel?: ModelType;
	availableModels?: ("openai" | "anthropic" | "google")[];
	lookback?: LookbackPeriod;

	// Single prompt mode (if promptName is provided)
	promptName?: string;
	promptId?: string;

	// Multi-prompt mode (if prompts array is provided)
	prompts?: PromptData[];
	groupName?: string;
	groupPrefix?: string;

	// Branding configuration (required)
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
	prompts = [],
	groupName,
	groupPrefix,
	parentName,
	optimizationUrlTemplate,
}: OptimizeButtonProps) {
	const [loadingKey, setLoadingKey] = useState<string | null>(null);

	// Handler for clicking an optimization link
	const handleOptimizeClick = async (
		e: React.MouseEvent,
		promptNameToUse: string,
		promptIdToUse: string,
		model?: string,
	) => {
		e.preventDefault();
		if (!brandId) return;

		const key = `${model || 'all'}-${promptIdToUse}`;
		setLoadingKey(key);

		try {
			const webQueryData = await fetchWebQuery(brandId, promptIdToUse, lookback, model);
			
			// Get the appropriate web query - use model-specific if available
			// If no web query exists for this model, leave it empty (don't fall back to prompt)
			const webQuery = model 
				? webQueryData.modelWebQueries[model]
				: webQueryData.webQuery;
			
			// Generate URL and navigate
			// Pass the actual web query or undefined - generateOptimizationUrl will leave it empty if not found
			const url = generateOptimizationUrl(
				optimizationUrlTemplate, 
				promptNameToUse, 
				brandId, 
				!!webQuery, // only enable web search if we have a query
				webQuery || undefined
			);
			
			window.open(url, "_blank", "noopener,noreferrer");
		} catch (error) {
			console.error("Failed to fetch web query:", error);
			// On error, just navigate without web query
			const url = generateOptimizationUrl(
				optimizationUrlTemplate, 
				promptNameToUse, 
				brandId, 
				false,
				undefined
			);
			window.open(url, "_blank", "noopener,noreferrer");
		} finally {
			setLoadingKey(null);
		}
	};

	const isLoading = (model: string | undefined, pId: string) => {
		return loadingKey === `${model || 'all'}-${pId}`;
	};

	const createSimpleButton = (pName: string, pId: string, model?: string) => {
		const loading = isLoading(model, pId);
		return (
			<Button 
				size="sm" 
				className="text-xs cursor-pointer p-0 m-0 h-6"
				onClick={(e) => handleOptimizeClick(e, pName, pId, model)}
				disabled={loading}
			>
				{loading ? (
					<IconLoader2 size={12} className="size-3 mr-0.5 animate-spin" />
				) : null}
				Optimize with {parentName}
				<IconExternalLink size={12} className="size-3 ml-0.5" />
			</Button>
		);
	};

	const createDropdownItem = (
		key: string,
		pName: string,
		pId: string,
		model?: string,
		displayText?: string,
	) => {
		const loading = isLoading(model, pId);
		return (
			<DropdownMenuItem 
				key={key} 
				className="cursor-pointer"
				onClick={(e) => handleOptimizeClick(e, pName, pId, model)}
				disabled={loading}
			>
				<div className="flex items-center justify-between w-full text-xs">
					<span className={displayText ? "text-muted-foreground" : ""}>
						{displayText || pName}
					</span>
					{loading ? (
						<IconLoader2 size={12} className="size-3 ml-2 animate-spin" />
					) : (
						<IconExternalLink size={12} className="size-3 ml-2" />
					)}
				</div>
			</DropdownMenuItem>
		);
	};

	const createFallbackDropdownItem = (key: string, text: string, showOptimizePrefix: boolean = false) => (
		<DropdownMenuItem key={key} className="cursor-pointer" disabled>
			<div className="flex items-center justify-between w-full text-xs">
				<span>
					{showOptimizePrefix ? (
						<>
							optimize <span className="text-muted-foreground">{text}</span>
						</>
					) : (
						<span className="text-muted-foreground">{text}</span>
					)}
				</span>
				<IconExternalLink size={12} className="size-3 ml-2" />
			</div>
		</DropdownMenuItem>
	);

	// Mode detection
	const isSingleMode = Boolean(promptName && promptId);
	const isMultiMode = prompts.length > 0;

	const renderModelSection = (model: string, modelIndex: number, isAllModelsMode: boolean = false) => {
		const modelName = getModelDisplayName(model);
		const items = [];

		if (modelIndex > 0) {
			items.push(<DropdownMenuSeparator key={`sep-${model}`} />);
		}

		items.push(<DropdownMenuLabel key={`label-${model}`}>Optimize for {modelName}</DropdownMenuLabel>);

		if (isSingleMode) {
			items.push(createDropdownItem(`${model}-${promptId}`, promptName!, promptId!, model));
		} else {
			// Multi-prompt mode
			if (prompts.length > 0) {
				prompts.forEach((prompt) => {
					const displayText = `${groupPrefix} ${prompt.value}`;
					items.push(createDropdownItem(`${model}-${prompt.id}`, prompt.value, prompt.id, model, displayText));
				});
			} else {
				items.push(createFallbackDropdownItem(`${model}-fallback`, groupName || "", isAllModelsMode));
			}
		}

		return items;
	};

	const showDropdown = selectedModel === "all" || isMultiMode;

	// Simple button for single prompt with specific model
	if (isSingleMode && !showDropdown) {
		return createSimpleButton(promptName!, promptId!, selectedModel);
	}

	// Dropdown menu for all other cases
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button size="sm" className="text-xs cursor-pointer p-0 m-0 h-6">
					Optimize with {parentName}
					<IconChevronDown size={12} className="size-3 ml-0.5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className={isMultiMode ? "w-100" : "w-48"}>
				{selectedModel === "all"
					? // Show all model sections
						availableModels.flatMap((model, index) => renderModelSection(model, index, true))
					: // Show single model section
						renderModelSection(selectedModel, 0, false)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
