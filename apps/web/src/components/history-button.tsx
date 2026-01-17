"use client";

import { GoStack } from "react-icons/go";
import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from "@workspace/ui/components/dropdown-menu";

type ModelType = "openai" | "anthropic" | "google" | "all";

interface PromptData {
	id: string;
	value: string;
}

interface HistoryButtonProps {
	// Basic configuration
	brandId?: string;

	// Single prompt mode (if promptName is provided)
	promptName?: string;
	promptId?: string;

	// Multi-prompt mode (if prompts array is provided)
	prompts?: PromptData[];
	groupName?: string;
	groupPrefix?: string;
}

export function HistoryButton({
	brandId,
	promptName,
	promptId,
	prompts = [],
	groupName,
	groupPrefix,
}: HistoryButtonProps) {
	const createHistoryUrl = (promptId: string) => {
		if (!brandId) return "#";
		return `/app/${brandId}/prompts/${promptId}`;
	};

	const createSimpleButton = (promptId: string) => (
		<Button size="sm" variant="secondary" className="text-xs cursor-pointer h-6 flex items-center px-2" asChild>
			<a href={createHistoryUrl(promptId)}>
				<GoStack className="size-3 mr-0.5" />
				<span className="text-xs font-normal">View Details</span>
			</a>
		</Button>
	);

	const createDropdownItem = (key: string, promptName: string, promptId: string, displayText?: string) => (
		<DropdownMenuItem key={key} className="cursor-pointer" asChild>
			<a href={createHistoryUrl(promptId)}>
				<div className="flex items-center justify-between w-full text-xs">
					<span className={displayText ? "text-muted-foreground" : ""}>{displayText || promptName}</span>
					<GoStack size={12} className="size-3 ml-2" />
				</div>
			</a>
		</DropdownMenuItem>
	);

	const createFallbackDropdownItem = (key: string, text: string) => (
		<DropdownMenuItem key={key} className="cursor-pointer" asChild>
			<a href="#" target="_blank" rel="noopener noreferrer">
				<div className="flex items-center justify-between w-full text-xs">
					<span className="text-muted-foreground">{text}</span>
					<GoStack size={12} className="size-3 ml-2" />
				</div>
			</a>
		</DropdownMenuItem>
	);

	// Mode detection
	const isSingleMode = Boolean(promptName && promptId);
	const isMultiMode = prompts.length > 0;

	// Simple button for single prompt
	if (isSingleMode && !isMultiMode) {
		return createSimpleButton(promptId!);
	}

	// Dropdown menu for group mode
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button size="sm" variant="secondary" className="text-xs cursor-pointer h-6 flex items-center px-2">
					<GoStack className="size-3 mr-1" />
					<span className="text-xs font-normal">View Details</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className={isMultiMode ? "w-100" : "w-48"}>
				<DropdownMenuLabel>View Prompt History</DropdownMenuLabel>
				{isMultiMode && (
					<>
						<DropdownMenuSeparator />
						{prompts.length > 0
							? prompts.map((prompt) => {
									const displayText = `${groupPrefix} ${prompt.value}`;
									return createDropdownItem(`${prompt.id}`, prompt.value, prompt.id, displayText);
								})
							: createFallbackDropdownItem("fallback", groupName || "")}
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
