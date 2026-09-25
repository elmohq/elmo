import { isPromptType } from "@workspace/lib/prompt-type";
import { normalizeTag } from "@workspace/lib/tag-utils";
import { Button } from "@workspace/ui/components/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@workspace/ui/components/command";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { cn } from "@workspace/ui/lib/utils";
import { Check, Minus, Plus, Tag } from "lucide-react";
import { useState } from "react";

export const PROMPT_TYPE_TAG_ERROR = "Branded and unbranded are set in the Type column, not as tags.";

/**
 * Tags across several prompts at once, the way mail clients label a selection:
 * a tag every selected prompt carries is checked and comes off all of them; one
 * that only some carry is mixed and goes onto the rest.
 */
export function BulkTagsMenu({
	selectedTags,
	allTags,
	onAdd,
	onRemove,
}: {
	/** The tags of each selected prompt. */
	selectedTags: readonly (readonly string[])[];
	allTags: readonly string[];
	onAdd: (tag: string) => void;
	onRemove: (tag: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");

	const carrying = (tag: string) => selectedTags.filter((tags) => tags.includes(tag)).length;
	const candidate = normalizeTag(query);
	const reserved = isPromptType(candidate);
	const showCreate = candidate.length > 0 && !reserved && !allTags.includes(candidate);
	const visible = allTags.filter((tag) => tag.includes(candidate));

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setQuery("");
			}}
		>
			<PopoverTrigger
				render={
					<Button type="button" size="sm" variant="outline" className="cursor-pointer gap-1.5">
						<Tag className="size-3.5" /> Tags
					</Button>
				}
			/>
			<PopoverContent align="end" className="w-64 p-0">
				<Command shouldFilter={false}>
					<CommandInput value={query} onValueChange={setQuery} placeholder="Search or create tag..." />
					<CommandList>
						{(showCreate || visible.length > 0) && (
							<CommandGroup>
								{showCreate && (
									<CommandItem
										value={`__create__:${candidate}`}
										onSelect={() => {
											onAdd(candidate);
											setQuery("");
										}}
									>
										<Plus className="size-4 opacity-60" />
										<span className="truncate">
											Add <span className="font-medium">&ldquo;{candidate}&rdquo;</span> to selected
										</span>
									</CommandItem>
								)}
								{visible.map((tag) => {
									const count = carrying(tag);
									const all = count === selectedTags.length;
									return (
										<CommandItem key={tag} value={tag} onSelect={() => (all ? onRemove(tag) : onAdd(tag))}>
											{count > 0 && !all ? (
												<Minus className="size-4" />
											) : (
												<Check className={cn("size-4", all ? "opacity-100" : "opacity-0")} />
											)}
											<span className="flex-1 truncate">{tag}</span>
											{count > 0 && !all && (
												<span className="text-xs text-muted-foreground tabular-nums">
													{count}/{selectedTags.length}
												</span>
											)}
										</CommandItem>
									);
								})}
							</CommandGroup>
						)}
						{!showCreate && visible.length === 0 && (
							<div className="px-3 py-4 text-center text-xs text-muted-foreground">
								{reserved ? PROMPT_TYPE_TAG_ERROR : candidate ? "No tags match." : "Type to create a tag."}
							</div>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
