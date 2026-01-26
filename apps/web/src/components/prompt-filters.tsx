"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { Filter, Search, Pencil } from "lucide-react";
import Link from "next/link";

interface PromptFiltersProps {
	availableTags: string[];
	selectedTags: string[];
	onTagsChange: (tags: string[]) => void;
	searchQuery?: string;
	onSearchChange?: (query: string) => void;
	editTagsLink?: string;
	className?: string;
	resultCount?: number;
}

export function PromptFilters({
	availableTags,
	selectedTags,
	onTagsChange,
	searchQuery = "",
	onSearchChange,
	editTagsLink,
	className,
	resultCount,
}: PromptFiltersProps) {
	const [open, setOpen] = useState(false);
	const [localSearch, setLocalSearch] = useState(searchQuery);
	const debounceRef = useRef<NodeJS.Timeout | null>(null);
	const lastCommittedSearch = useRef(searchQuery);

	// Sync local search with external searchQuery only when it changes externally (e.g., URL change)
	useEffect(() => {
		if (searchQuery !== lastCommittedSearch.current) {
			setLocalSearch(searchQuery);
			lastCommittedSearch.current = searchQuery;
		}
	}, [searchQuery]);

	// Commit search change
	const commitSearch = useCallback((value: string) => {
		if (onSearchChange) {
			lastCommittedSearch.current = value;
			onSearchChange(value);
		}
	}, [onSearchChange]);

	// Debounced search - only depends on localSearch
	useEffect(() => {
		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
		}

		debounceRef.current = setTimeout(() => {
			if (localSearch !== lastCommittedSearch.current) {
				commitSearch(localSearch);
			}
		}, 300);

		return () => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
		};
	}, [localSearch, commitSearch]);

	const toggleTag = (tag: string) => {
		if (selectedTags.includes(tag)) {
			onTagsChange(selectedTags.filter((t) => t !== tag));
		} else {
			onTagsChange([...selectedTags, tag]);
		}
	};

	const clearAll = () => {
		onTagsChange([]);
		if (onSearchChange) {
			// Clear debounce timer to prevent stale updates
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
			setLocalSearch("");
			commitSearch("");
		}
	};

	const hasActiveFilters = selectedTags.length > 0 || (searchQuery && searchQuery.length > 0);
	const filterCount = selectedTags.length + (searchQuery ? 1 : 0);

	return (
		<Popover open={open} onOpenChange={setOpen} modal={false}>
			<PopoverTrigger asChild>
				<Button
					variant={hasActiveFilters ? "default" : "outline"}
					size="sm"
					className={`h-8 gap-1.5 cursor-pointer ${className}`}
				>
					<Filter className="h-3.5 w-3.5" />
					<span>Filters</span>
					{hasActiveFilters && (
						<span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary-foreground text-primary text-xs font-medium">
							{filterCount}
						</span>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent 
				align="end" 
				className="w-64 p-0" 
				onOpenAutoFocus={(e) => e.preventDefault()}
				onInteractOutside={(e) => {
					// Don't close when interacting with elements inside the popover
					const target = e.target as HTMLElement;
					if (target.closest('[data-radix-popper-content-wrapper]')) {
						e.preventDefault();
					}
				}}
			>
				{/* Header - fixed height */}
				<div className="flex items-center justify-between px-3 h-11 border-b bg-muted/30">
					<div className="flex items-center gap-2">
						<span className="font-medium text-sm">Filters</span>
						{resultCount !== undefined && (
							<span className="text-sm text-muted-foreground">
								({resultCount.toLocaleString()} {resultCount === 1 ? "result" : "results"})
							</span>
						)}
					</div>
					{hasActiveFilters && (
						<button
							type="button"
							onClick={clearAll}
							className="text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
						>
							Clear
						</button>
					)}
				</div>

				{/* Search */}
				{onSearchChange && (
					<div className="px-3 py-3 border-b">
						<div className="relative">
							<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<Input
								value={localSearch}
								onChange={(e) => setLocalSearch(e.target.value)}
								placeholder="Search..."
								className="h-9 pl-9 text-sm bg-muted/50 border-0 focus-visible:ring-1"
							/>
						</div>
					</div>
				)}

				{/* Tags */}
				<div className="px-3 py-3">
					<div className="flex items-center justify-between mb-2">
						<span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tags</span>
						{editTagsLink && (
							<Link
								href={editTagsLink}
								className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
							>
								<Pencil className="h-3 w-3" />
								Edit
							</Link>
						)}
					</div>
					
					{availableTags.length === 0 ? (
						<p className="text-sm text-muted-foreground py-3 text-center">No tags available</p>
					) : (
						<div className="space-y-0.5 max-h-52 overflow-y-auto -mx-1">
							{availableTags.map((tag) => (
								<div
									key={tag}
									role="button"
									tabIndex={0}
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										toggleTag(tag);
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											toggleTag(tag);
										}
									}}
									className={`flex items-center gap-2.5 w-full py-2 px-2 rounded-md cursor-pointer transition-colors text-left ${
										selectedTags.includes(tag)
											? "bg-primary/10 text-primary"
											: "hover:bg-muted"
									}`}
								>
									<Checkbox
										checked={selectedTags.includes(tag)}
										className="pointer-events-none"
									/>
									<span className="text-sm capitalize flex-1">{tag}</span>
								</div>
							))}
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
