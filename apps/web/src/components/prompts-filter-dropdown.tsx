import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { ListFilter } from "lucide-react";
import { useMemo, useState } from "react";
import { FilterTriggerButton } from "@/components/filter-bar";

export interface PromptOption {
	id: string;
	value: string;
}

/** Multi-select over a brand's prompts, searchable because a brand can have hundreds. */
export function PromptsFilterDropdown({
	prompts,
	selected,
	onChange,
}: {
	prompts: readonly PromptOption[];
	selected: readonly string[];
	onChange: (next: string[]) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const visible = useMemo(() => {
		const needle = search.trim().toLowerCase();
		const matching = needle ? prompts.filter((p) => p.value.toLowerCase().includes(needle)) : prompts;
		// Picked prompts stay at the top so they can be unpicked without scrolling.
		return [...matching].sort(
			(a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)) || a.value.localeCompare(b.value),
		);
	}, [prompts, search, selected]);

	const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

	return (
		<Popover open={open} onOpenChange={setOpen} modal={false}>
			<PopoverTrigger
				render={
					<FilterTriggerButton
						icon={<ListFilter className="size-3.5" />}
						label="Prompts"
						active={selected.length > 0}
						badgeCount={selected.length > 0 ? selected.length : undefined}
					/>
				}
			/>
			<PopoverContent align="start" className="w-96 p-0">
				<div className="flex items-center justify-between px-3 h-10 border-b">
					<span className="font-medium text-sm">Prompts</span>
					{selected.length > 0 && (
						<button
							type="button"
							onClick={() => onChange([])}
							className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
						>
							Clear
						</button>
					)}
				</div>
				<div className="p-2 border-b">
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search prompts..."
						className="h-8 text-sm"
					/>
				</div>
				{visible.length === 0 ? (
					<p className="text-sm text-muted-foreground py-6 text-center">No prompts match</p>
				) : (
					<div className="py-1 max-h-72 overflow-y-auto">
						{visible.map((prompt) => {
							const checked = selected.includes(prompt.id);
							return (
								<button
									key={prompt.id}
									type="button"
									onClick={(e) => {
										// Keep the popover open so several prompts can be picked at once.
										e.preventDefault();
										e.stopPropagation();
										toggle(prompt.id);
									}}
									className={`flex w-full items-start gap-2.5 py-1.5 px-3 cursor-pointer text-left text-sm ${
										checked ? "bg-accent" : "hover:bg-muted"
									}`}
								>
									<Checkbox checked={checked} className="pointer-events-none mt-0.5" />
									<span className="flex-1 line-clamp-2">{prompt.value || "(untitled prompt)"}</span>
								</button>
							);
						})}
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
