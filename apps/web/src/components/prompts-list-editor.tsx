/**
 * Shared prompts table — used by the settings/prompts page (manages a brand's
 * full prompt list) and the prompt wizard's Review step (picks from
 * AI-suggested prompts + custom additions).
 *
 * Controlled component: the caller owns the `prompts` array and the change
 * callback. The settings page wraps it with save/server logic; the wizard
 * keeps it inline. The `showSystemTags` prop hides the System Tags column
 * in the wizard since onboarding hasn't yet computed any system tags.
 */
import { useMemo } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { Plus, Inbox, Check } from "lucide-react";
import { IconInfoCircle } from "@tabler/icons-react";

export interface EditablePrompt {
	id?: string;
	_key: string;
	value: string;
	enabled: boolean;
	tags: string[];
	systemTags: string[];
}

export function newPromptEntry(partial?: Partial<EditablePrompt>): EditablePrompt {
	return {
		_key: crypto.randomUUID(),
		value: partial?.value ?? "",
		enabled: partial?.enabled ?? true,
		tags: partial?.tags ?? [],
		systemTags: partial?.systemTags ?? [],
		...(partial?.id ? { id: partial.id } : {}),
	};
}

interface PromptsListEditorProps {
	prompts: EditablePrompt[];
	onChange: (next: EditablePrompt[]) => void;
	/** Show the read-only System Tags column. Default true. */
	showSystemTags?: boolean;
}

export function PromptsListEditor({ prompts, onChange, showSystemTags = true }: PromptsListEditorProps) {
	const allTagOptions = useMemo(() => {
		const set = new Set<string>();
		for (const p of prompts) for (const t of p.tags) set.add(t);
		return [...set].sort().map((t) => ({ value: t }));
	}, [prompts]);

	const update = (index: number, patch: Partial<EditablePrompt>) => {
		onChange(prompts.map((p, i) => (i === index ? { ...p, ...patch } : p)));
	};
	const add = () => onChange([...prompts, newPromptEntry()]);

	const gridCols = showSystemTags
		? "grid-cols-[3rem_1fr_6rem_minmax(14rem,1fr)]"
		: "grid-cols-[3rem_1fr_minmax(14rem,1fr)]";

	return (
		<div className="space-y-4">
			<div className={`grid ${gridCols} gap-2 text-sm font-medium text-muted-foreground border-b pb-2`}>
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
				{showSystemTags && (
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
				)}
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

			{prompts.length === 0 ? (
				<div className="border-2 border-dashed border-muted rounded-lg min-h-48 flex items-center justify-center">
					<div className="text-center py-8 text-muted-foreground">
						<Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
						<p>No prompts yet.</p>
					</div>
				</div>
			) : (
				<div className="space-y-3">
					{prompts.map((prompt, index) => (
						<div
							key={prompt._key}
							className={`grid ${gridCols} gap-2 items-start ${!prompt.enabled ? "opacity-60" : ""}`}
						>
							<div className="flex justify-center pt-2">
								<Checkbox
									checked={prompt.enabled}
									onCheckedChange={(checked) => update(index, { enabled: checked === true })}
								/>
							</div>
							<Input
								value={prompt.value}
								onChange={(e) => update(index, { value: e.target.value })}
								placeholder="Enter prompt text..."
							/>
							{showSystemTags && (
								<TagsInput value={prompt.systemTags} onValueChange={() => {}} disabled placeholder="—" />
							)}
							<TagsInput
								value={prompt.tags}
								onValueChange={(tags) => update(index, { tags })}
								options={allTagOptions}
								placeholder="Add tag..."
								searchPlaceholder="Search or create tag..."
								normalizeValue={(raw) => raw.toLowerCase().trim()}
							/>
						</div>
					))}
				</div>
			)}

			<Button
				variant="outline"
				size="sm"
				type="button"
				onClick={add}
				className="flex items-center gap-2 cursor-pointer"
			>
				<Plus className="h-4 w-4" /> Add Prompt
			</Button>
		</div>
	);
}
