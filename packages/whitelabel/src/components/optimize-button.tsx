"use client";

import { IconExternalLink, IconChevronDown } from "@tabler/icons-react";
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

interface PromptData {
	id: string;
	value: string;
}

export interface OptimizeButtonProps {
	// Basic configuration
	brandId?: string;
	webSearchEnabled?: boolean;
	selectedModel?: ModelType;
	availableModels?: ("openai" | "anthropic" | "google")[];

	// Single prompt mode (if promptName is provided)
	promptName?: string;
	promptId?: string;

	// Multi-prompt mode (if prompts array is provided)
	prompts?: PromptData[];
	groupName?: string;
	groupPrefix?: string;

	// Web query mappings for generating optimization URLs
	webQueryMapping?: Record<string, string>;
	modelWebQueryMappings?: Record<string, Record<string, string>>;

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

export function OptimizeButton({
	brandId,
	webSearchEnabled,
	selectedModel = "all",
	availableModels = ["openai", "anthropic", "google"],
	promptName,
	promptId,
	prompts = [],
	groupName,
	groupPrefix,
	webQueryMapping = {},
	modelWebQueryMappings = {},
	parentName,
	optimizationUrlTemplate,
}: OptimizeButtonProps) {
	// Helper functions
	const createOptimizationUrl = (promptName: string, promptId: string, model?: string) => {
		if (!brandId) return "#";

		const webQuery = model ? modelWebQueryMappings[model]?.[promptId] : webQueryMapping[promptId];

		// Fall back to prompt's value if no web query is found
		const finalWebQuery = webQuery || promptName;

		return generateOptimizationUrl(optimizationUrlTemplate, promptName, brandId, webSearchEnabled, finalWebQuery);
	};

	const createSimpleButton = (promptName: string, promptId: string, model?: string) => (
		<Button size="sm" className="text-xs cursor-pointer p-0 m-0 h-6" asChild>
			<a href={createOptimizationUrl(promptName, promptId, model)} target="_blank" rel="noopener noreferrer">
				Optimize with {parentName}
				<IconExternalLink size={12} className="size-3 ml-0.5" />
			</a>
		</Button>
	);

	const createDropdownItem = (
		key: string,
		promptName: string,
		promptId: string,
		model?: string,
		displayText?: string,
	) => (
		<DropdownMenuItem key={key} className="cursor-pointer" asChild>
			<a href={createOptimizationUrl(promptName, promptId, model)} target="_blank" rel="noopener noreferrer">
				<div className="flex items-center justify-between w-full text-xs">
					<span className={displayText ? "text-muted-foreground" : ""}>{displayText || promptName}</span>
					<IconExternalLink size={12} className="size-3 ml-2" />
				</div>
			</a>
		</DropdownMenuItem>
	);

	const createFallbackDropdownItem = (key: string, text: string, showOptimizePrefix: boolean = false) => (
		<DropdownMenuItem key={key} className="cursor-pointer" asChild>
			<a href="#" target="_blank" rel="noopener noreferrer">
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
			</a>
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
		return createSimpleButton(promptName!, promptId!);
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
