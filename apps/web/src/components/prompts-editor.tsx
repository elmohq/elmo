
import { useState, useRef, useMemo } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Badge } from "@workspace/ui/components/badge";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { Plus, Save, Inbox, Check, AlertTriangle } from "lucide-react";
import { IconInfoCircle } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useInvalidatePromptsSummary } from "@/hooks/use-prompts-summary";
import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";
import { updatePromptsFn } from "@/server/prompts";
import { trackEvent } from "@/lib/posthog";

interface Prompt {
	id: string;
	brandId: string;
	value: string;
	enabled: boolean;
	tags?: string[];
	systemTags?: string[];
	createdAt: Date;
}

interface EditablePrompt {
	id?: string; // undefined for new prompts
	_key: string;
	value: string;
	enabled: boolean;
	tags: string[];
	systemTags: string[]; // read-only, from initial data
}

interface PromptsEditorProps {
	initialPrompts: Prompt[];
	brandId: string;
	pageTitle: string;
	pageDescription: string;
}

export function PromptsEditor({ initialPrompts, brandId, pageTitle, pageDescription }: PromptsEditorProps) {
	const [prompts, setPrompts] = useState<EditablePrompt[]>(() =>
		initialPrompts.map((p) => ({
			id: p.id,
			_key: p.id,
			value: p.value,
			enabled: p.enabled,
			tags: p.tags || [],
			systemTags: p.systemTags || [],
		})),
	);
	const [isLoading, setIsLoading] = useState(false);
	const saveInProgress = useRef(false);
	const navigate = useNavigate();
	const invalidatePromptsSummary = useInvalidatePromptsSummary();

	const allTagOptions = useMemo(() => {
		const set = new Set<string>();
		for (const p of prompts) {
			for (const t of p.tags) set.add(t);
		}
		return [...set].sort().map((t) => ({ value: t }));
	}, [prompts]);

	const addPrompt = () => {
		setPrompts([...prompts, { _key: crypto.randomUUID(), value: "", enabled: true, tags: [], systemTags: [] }]);
	};

	const updatePrompt = (index: number, field: keyof EditablePrompt, value: string | boolean | string[]) => {
		const updated = [...prompts];
		updated[index] = { ...updated[index], [field]: value };
		setPrompts(updated);
	};

	const savePrompts = async () => {
		if (saveInProgress.current) {
			console.warn("Save already in progress, ignoring duplicate request");
			return;
		}

		saveInProgress.current = true;
		setIsLoading(true);
		try {
			const validPrompts = prompts.filter((p) => p.value.trim());

			const currentIds = new Set(validPrompts.filter((p) => p.id).map((p) => p.id));
			const removedPrompts = initialPrompts
				.filter((p) => !currentIds.has(p.id))
				.map((p) => ({ id: p.id, value: p.value, enabled: false, tags: p.tags || [] }));

			const allPrompts = [
				...validPrompts.map((p) => ({
					...(p.id ? { id: p.id } : {}),
					value: p.value.trim(),
					enabled: p.enabled,
					tags: p.tags,
				})),
				...removedPrompts,
			];

			await updatePromptsFn({ data: { brandId, prompts: allPrompts } });

			const added = validPrompts.filter((p) => !p.id).length;
			const edited = validPrompts.filter((p) => p.id).length;
			const deleted = removedPrompts.length;
			trackEvent("prompts_updated", { added, edited, deleted });

			invalidatePromptsSummary(brandId);
			navigate({ to: `/app/${brandId}/visibility` });
		} catch (error) {
			console.error("Error saving prompts:", error);
			alert(`Failed to save prompts: ${error instanceof Error ? error.message : "Unknown error"}`);
		} finally {
			setIsLoading(false);
			saveInProgress.current = false;
		}
	};

	const validPromptCount = prompts.filter((p) => p.value.trim()).length;
	const enabledPromptCount = prompts.filter((p) => p.value.trim() && p.enabled).length;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">{pageTitle}</h1>
					<p className="text-muted-foreground">{pageDescription}</p>
				</div>
			</div>

			<div className="space-y-4">
				{/* Header row - always shown */}
				<div className="grid grid-cols-[3rem_1fr_6rem_minmax(14rem,1fr)] gap-2 text-sm font-medium text-muted-foreground border-b pb-2">
					<div className="flex justify-center">
						<Check className="h-4 w-4" />
					</div>
					<div className="flex items-center gap-1">
						Prompt Text
						<Tooltip>
							<TooltipTrigger asChild>
								<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
							</TooltipTrigger>
							<TooltipContent>
								<p className="max-w-xs">The question or query that will be sent to AI models for evaluation.</p>
							</TooltipContent>
						</Tooltip>
					</div>
					<div className="flex items-center gap-1">
						System
						<Tooltip>
							<TooltipTrigger asChild>
								<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
							</TooltipTrigger>
							<TooltipContent>
								<p className="max-w-xs">Auto-generated tags like &quot;branded&quot; or &quot;unbranded&quot; based on prompt content.</p>
							</TooltipContent>
						</Tooltip>
					</div>
					<div className="flex items-center gap-1">
						Tags
						<Tooltip>
							<TooltipTrigger asChild>
								<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
							</TooltipTrigger>
							<TooltipContent>
								<p className="max-w-xs">Custom labels to organize and filter prompts.</p>
							</TooltipContent>
						</Tooltip>
					</div>
				</div>

				{/* Content area - either placeholder or prompt rows */}
				{prompts.length === 0 ? (
					<div className="border-2 border-dashed border-muted rounded-lg min-h-48 flex items-center justify-center">
						<div className="text-center py-8 text-muted-foreground">
							<Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
							<p>No prompts yet.</p>
						</div>
					</div>
				) : (
					<div className="space-y-3">
						{/* Prompt rows */}
						{prompts.map((prompt, index) => (
							<div
								key={prompt._key}
								className={`grid grid-cols-[3rem_1fr_6rem_minmax(14rem,1fr)] gap-2 items-start ${!prompt.enabled ? "opacity-60" : ""}`}
							>
								<div className="flex justify-center pt-2">
									<Checkbox
										checked={prompt.enabled}
										onCheckedChange={(checked) => updatePrompt(index, "enabled", checked === true)}
									/>
								</div>
								<Input
									value={prompt.value}
									onChange={(e) => updatePrompt(index, "value", e.target.value)}
									placeholder="Enter prompt text..."
								/>
								{/* System Tags (read-only) with override indicator */}
								<div className="flex items-center h-9">
									{prompt.systemTags.length > 0 ? (
										(() => {
											const effectiveStatus = getEffectiveBrandedStatus(prompt.systemTags, prompt.tags);
											return (
												<div className="flex flex-wrap gap-1 items-center">
													{prompt.systemTags.map((tag, tagIndex) => {
														const normalizedTag = tag.toLowerCase();
														const isBrandedTag = normalizedTag === "branded" || normalizedTag === "unbranded";
														const showOverride = isBrandedTag && effectiveStatus.isOverridden;
														return (
															<Tooltip key={tagIndex}>
																<TooltipTrigger asChild>
																	<Badge 
																		variant="outline" 
																		className={`text-xs capitalize bg-muted/50 gap-1 ${
																			showOverride ? "line-through opacity-60" : ""
																		}`}
																	>
																		{showOverride && (
																			<AlertTriangle className="h-3 w-3 text-muted-foreground" />
																		)}
																		{tag}
																	</Badge>
																</TooltipTrigger>
																{showOverride && (
																	<TooltipContent>
																		<p className="max-w-xs">
																			Overridden by user tag: {effectiveStatus.isBranded ? "branded" : "unbranded"}
																		</p>
																	</TooltipContent>
																)}
															</Tooltip>
														);
													})}
												</div>
											);
										})()
									) : (
										<span className="text-xs text-muted-foreground">—</span>
									)}
								</div>
								{/* User Tags (editable) */}
								<TagsInput
									value={prompt.tags}
									onValueChange={(tags) => updatePrompt(index, "tags", tags)}
									options={allTagOptions}
									placeholder="Add tag..."
									searchPlaceholder="Search or create tag..."
									normalizeValue={(raw) => raw.toLowerCase().trim()}
								/>
							</div>
						))}
					</div>
				)}

				{/* Buttons - always shown */}
				<div className="flex gap-2 items-center">
					<Button
						onClick={savePrompts}
						disabled={isLoading}
						size="sm"
						className="flex items-center gap-2 cursor-pointer"
					>
						{isLoading ? (
							<>Saving...</>
						) : (
							<>
								<Save className="h-4 w-4" />
								Save Prompts
							</>
						)}
					</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={addPrompt}
					className="flex items-center gap-2 cursor-pointer"
				>
					<Plus className="h-4 w-4" /> Add Prompt
				</Button>
				</div>

			{/* Count information */}
			<div className="text-xs text-muted-foreground">
				<strong>{enabledPromptCount}</strong> enabled prompts
				{validPromptCount !== enabledPromptCount && (
					<span className="ml-2">• {validPromptCount - enabledPromptCount} disabled</span>
				)}
			</div>
			</div>
		</div>
	);
}
