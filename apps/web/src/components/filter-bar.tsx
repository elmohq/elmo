import { ReactNode, useEffect, useRef, useState, useMemo, startTransition } from "react";
import { useQueryState, parseAsStringLiteral, parseAsArrayOf, parseAsString } from "nuqs";
import { SiOpenai, SiGoogle, SiAnthropic } from "react-icons/si";
import { MdSelectAll } from "react-icons/md";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { ChevronDown, Search, Tag as TagIcon, Clock, X } from "lucide-react";
import { type LookbackPeriod, getDefaultLookbackPeriod } from "@/lib/chart-utils";
import { useBrand } from "@/hooks/use-brands";

export type ModelType = "chatgpt" | "claude" | "google-ai-mode" | "all";

/** All individual models Elmo tracks. Used as the fallback when a brand has
 *  no per-brand model config. Keep in sync with the visibility/citations
 *  backend so the filter stays a pure display concern. */
const ALL_MODEL_IDS = ["chatgpt", "claude", "google-ai-mode"] as const satisfies readonly Exclude<ModelType, "all">[];

/** Compute the filter options to show for a brand.
 *  - Unconfigured (`null`/empty): every known model + "All" (matches pre-config behavior).
 *  - 2+ configured: those specific models + "All".
 *  - 1 configured: just that model — hides the "All" toggle since it's redundant.
 *  Callers decide whether to render a selector when only one model is returned. */
export function getAvailableModelsForBrand(
	enabledModels: readonly string[] | null | undefined,
): ModelType[] {
	const configured = enabledModels?.length
		? ALL_MODEL_IDS.filter((m) => enabledModels.includes(m))
		: [...ALL_MODEL_IDS];
	return configured.length > 1 ? ["all", ...configured] : configured;
}

// Every URL setter runs its React state update through React.startTransition,
// which makes the resulting re-render (data consumers, chart cards, SWR
// refetches) interruptible. Urgent work — dropdown close animations, the
// next click, typing — cuts in front and the filter interaction feels
// instant. nuqs documents this option at https://nuqs.47ng.com/docs/options.
const modelParser = parseAsStringLiteral(["chatgpt", "claude", "google-ai-mode", "all"] as const).withOptions({ startTransition });
const lookbackParser = parseAsStringLiteral(["1w", "1m", "3m", "6m", "1y", "all"] as const).withOptions({ startTransition });
const tagsParser = parseAsArrayOf(parseAsString, ",").withOptions({ startTransition });
const searchParser = parseAsString.withOptions({ startTransition });

function getModelIcon(modelType: ModelType, className = "size-3.5") {
	switch (modelType) {
		case "chatgpt":
			return <SiOpenai className={className} />;
		case "claude":
			return <SiAnthropic className={className} />;
		case "google-ai-mode":
			return <SiGoogle className={className} />;
		case "all":
			return <MdSelectAll className={className} />;
	}
}

function getModelLabel(modelType: ModelType): string {
	switch (modelType) {
		case "chatgpt":
			return "ChatGPT";
		case "claude":
			return "Claude";
		case "google-ai-mode":
			return "Google";
		case "all":
			return "All models";
	}
}

const LOOKBACK_OPTIONS: { value: LookbackPeriod; label: string }[] = [
	{ value: "1w", label: "Last 7 days" },
	{ value: "1m", label: "Last 30 days" },
	{ value: "3m", label: "Last 3 months" },
	{ value: "6m", label: "Last 6 months" },
	{ value: "1y", label: "Last 12 months" },
	{ value: "all", label: "All time" },
];

function getLookbackLabel(lookback: LookbackPeriod): string {
	return LOOKBACK_OPTIONS.find((o) => o.value === lookback)?.label ?? lookback;
}

// Shallow equality for string[] — tag lists are short so the O(n) scan is fine.
function arraysEqual(a: readonly string[], b: readonly string[]) {
	if (a === b) return true;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

// ------------------------------------------------------------------
// Trigger button (used by every dropdown)
// ------------------------------------------------------------------

type FilterTriggerButtonProps = {
	icon: ReactNode;
	label: string;
	active?: boolean;
	badgeCount?: number;
} & React.ComponentProps<"button">;

// Props forward to the underlying Button so `<DropdownMenuTrigger asChild>` /
// `<PopoverTrigger asChild>` can hand their ref + data-state directly to the
// button element (wrapping in a div would make Slot target the div instead).
function FilterTriggerButton({
	icon,
	label,
	active,
	badgeCount,
	className,
	...props
}: FilterTriggerButtonProps) {
	return (
		<Button
			variant="outline"
			size="sm"
			{...props}
			className={`h-8 gap-1.5 cursor-pointer font-normal ${
				active ? "border-foreground/30 bg-accent/50" : ""
			} ${className ?? ""}`}
		>
			<span className="text-muted-foreground flex items-center">{icon}</span>
			<span className="text-foreground">{label}</span>
			{badgeCount !== undefined && badgeCount > 0 && (
				<span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
					{badgeCount}
				</span>
			)}
			<ChevronDown className="size-3.5 text-muted-foreground" />
		</Button>
	);
}

// ------------------------------------------------------------------
// Model dropdown — subscribes to only the "model" URL key.
// ------------------------------------------------------------------

export function ModelDropdown({ availableModels }: { availableModels: ModelType[] }) {
	const defaultModel: ModelType = availableModels.includes("all")
		? "all"
		: (availableModels[0] ?? "all");
	const [urlModel, setUrlModel] = useQueryState("model", modelParser.withDefault(defaultModel));
	const selected = urlModel ?? defaultModel;

	// Optimistic local copy so the trigger label flips on click, without
	// waiting for the URL round-trip or any downstream re-render.
	const [optimistic, setOptimistic] = useState<ModelType>(selected);
	const pushedRef = useRef(selected);
	useEffect(() => {
		if (selected === pushedRef.current) return;
		pushedRef.current = selected;
		setOptimistic(selected);
	}, [selected]);

	const handleChange = (next: ModelType) => {
		setOptimistic(next);
		pushedRef.current = next;
		setUrlModel(next);
	};

	if (availableModels.length <= 1) return null;
	const isFiltered = optimistic !== "all";
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<FilterTriggerButton
					icon={getModelIcon(optimistic)}
					label={getModelLabel(optimistic)}
					active={isFiltered}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-48">
				<DropdownMenuRadioGroup
					value={optimistic}
					onValueChange={(v) => handleChange(v as ModelType)}
				>
					{availableModels.map((model) => (
						<DropdownMenuRadioItem key={model} value={model} className="cursor-pointer gap-2">
							{getModelIcon(model)}
							{getModelLabel(model)}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// ------------------------------------------------------------------
// Lookback dropdown — subscribes to only the "lookback" URL key.
// ------------------------------------------------------------------

export function LookbackDropdown() {
	const { brand } = useBrand();
	const defaultLookback = useMemo(
		() => getDefaultLookbackPeriod(brand?.earliestDataDate),
		[brand?.earliestDataDate],
	);
	const [urlLookback, setUrlLookback] = useQueryState("lookback", lookbackParser.withDefault(defaultLookback));
	const selected = urlLookback ?? defaultLookback;

	const [optimistic, setOptimistic] = useState<LookbackPeriod>(selected);
	const pushedRef = useRef<LookbackPeriod>(selected);
	useEffect(() => {
		if (selected === pushedRef.current) return;
		pushedRef.current = selected;
		setOptimistic(selected);
	}, [selected]);

	const handleChange = (next: LookbackPeriod) => {
		setOptimistic(next);
		pushedRef.current = next;
		setUrlLookback(next);
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<FilterTriggerButton
					icon={<Clock className="size-3.5" />}
					label={getLookbackLabel(optimistic)}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-48">
				<DropdownMenuRadioGroup
					value={optimistic}
					onValueChange={(v) => handleChange(v as LookbackPeriod)}
				>
					{LOOKBACK_OPTIONS.map((opt) => (
						<DropdownMenuRadioItem key={opt.value} value={opt.value} className="cursor-pointer">
							{opt.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// ------------------------------------------------------------------
// Tags dropdown — subscribes to only the "tags" URL key.
// Consumer passes `availableTags` (derived from prompts summary) so the
// dropdown doesn't need to fetch.
// ------------------------------------------------------------------

export function TagsDropdown({ availableTags }: { availableTags: readonly string[] }) {
	const [urlTags, setUrlTags] = useQueryState("tags", tagsParser.withDefault([]));
	const selected = urlTags ?? [];

	const [optimistic, setOptimistic] = useState<string[]>(selected);
	const pushedRef = useRef<readonly string[]>(selected);
	useEffect(() => {
		if (arraysEqual(selected, pushedRef.current)) return;
		pushedRef.current = selected;
		setOptimistic([...selected]);
	}, [selected]);

	const commit = (next: string[]) => {
		setOptimistic(next);
		pushedRef.current = next;
		setUrlTags(next.length ? next : null);
	};
	const toggle = (tag: string) => {
		commit(
			optimistic.includes(tag) ? optimistic.filter((t) => t !== tag) : [...optimistic, tag],
		);
	};

	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen} modal={false}>
			<PopoverTrigger asChild>
				<FilterTriggerButton
					icon={<TagIcon className="size-3.5" />}
					label="Tags"
					active={optimistic.length > 0}
					badgeCount={optimistic.length > 0 ? optimistic.length : undefined}
				/>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
				<div className="flex items-center justify-between px-3 h-10 border-b">
					<span className="font-medium text-sm">Tags</span>
					{optimistic.length > 0 && (
						<button
							type="button"
							onClick={() => commit([])}
							className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
						>
							Clear
						</button>
					)}
				</div>
				{availableTags.length === 0 ? (
					<p className="text-sm text-muted-foreground py-6 text-center">No tags available</p>
				) : (
					<div className="py-1 max-h-64 overflow-y-auto">
						{availableTags.map((tag) => {
							const checked = optimistic.includes(tag);
							return (
								<div
									key={tag}
									role="button"
									tabIndex={0}
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										toggle(tag);
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											toggle(tag);
										}
									}}
									className={`flex items-center gap-2.5 py-1.5 px-3 cursor-pointer text-left text-sm ${
										checked ? "bg-accent" : "hover:bg-muted"
									}`}
								>
									<Checkbox checked={checked} className="pointer-events-none" />
									<span className="capitalize flex-1">{tag}</span>
								</div>
							);
						})}
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}

// ------------------------------------------------------------------
// Search input — subscribes to only the "q" URL key.
// Debounces keystrokes and uses an effect-based sync (no render-time
// setState) to avoid flashing back when the URL echo races with typing.
// ------------------------------------------------------------------

export function SearchInput({ placeholder = "Search prompts..." }: { placeholder?: string }) {
	const [urlValue, setUrlValue] = useQueryState("q", searchParser.withDefault(""));
	const value = urlValue ?? "";

	const [local, setLocal] = useState(value);
	const pushedRef = useRef(value);

	useEffect(() => {
		if (value === pushedRef.current) return;
		pushedRef.current = value;
		setLocal(value);
	}, [value]);

	useEffect(() => {
		if (local === pushedRef.current) return;
		const timer = setTimeout(() => {
			pushedRef.current = local;
			setUrlValue(local.length ? local : null);
		}, 250);
		return () => clearTimeout(timer);
	}, [local, setUrlValue]);

	const clear = () => {
		setLocal("");
		pushedRef.current = "";
		setUrlValue(null);
	};

	return (
		<div className="relative w-full sm:w-64">
			<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
			<Input
				value={local}
				onChange={(e) => setLocal(e.target.value)}
				placeholder={placeholder}
				className="h-8 pl-8 pr-8 text-sm"
			/>
			{local && (
				<button
					type="button"
					onClick={clear}
					className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
					aria-label="Clear search"
				>
					<X className="h-3.5 w-3.5" />
				</button>
			)}
		</div>
	);
}

// ------------------------------------------------------------------
// Result count — subscribes only to the two URL keys that gate its
// visibility (tags + q). Parent passes the count as a prop so the
// prompts-summary query is read once by a single owner.
// ------------------------------------------------------------------

export function ResultCount({ count }: { count: number | undefined }) {
	const [tags] = useQueryState("tags", tagsParser.withDefault([]));
	const [q] = useQueryState("q", searchParser.withDefault(""));
	const active = (tags?.length ?? 0) > 0 || Boolean(q);
	if (!active || count === undefined) return null;
	return (
		<span className="text-xs text-muted-foreground tabular-nums ml-1">
			{count.toLocaleString()} {count === 1 ? "result" : "results"}
		</span>
	);
}

// ------------------------------------------------------------------
// Composed FilterBar
// ------------------------------------------------------------------

export function FilterBar({
	availableTags,
	availableModels,
	showSearch,
	showModelSelector,
	resultCount,
}: {
	availableTags: readonly string[];
	availableModels: ModelType[];
	showSearch: boolean;
	showModelSelector: boolean;
	resultCount: number | undefined;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-2">
			<div className="flex flex-wrap items-center gap-1.5">
				{showModelSelector && <ModelDropdown availableModels={availableModels} />}
				<TagsDropdown availableTags={availableTags} />
				<LookbackDropdown />
				<ResultCount count={resultCount} />
			</div>
			{showSearch && <SearchInput />}
		</div>
	);
}

// ------------------------------------------------------------------
// Hooks for data-fetching consumers that need all four values at once.
// These subscribe to every URL key, so only use in components that
// actually compose a SWR query from the full filter set.
// ------------------------------------------------------------------

export function usePageFilters() {
	const { brand } = useBrand();
	const defaultLookback = useMemo(
		() => getDefaultLookbackPeriod(brand?.earliestDataDate),
		[brand?.earliestDataDate],
	);

	const [selectedModel] = useQueryState("model", modelParser.withDefault("all"));
	const [selectedLookback] = useQueryState("lookback", lookbackParser.withDefault(defaultLookback));
	const [selectedTags] = useQueryState("tags", tagsParser.withDefault([]));
	const [searchQuery] = useQueryState("q", searchParser.withDefault(""));

	return {
		selectedModel: (selectedModel ?? "all") as ModelType,
		selectedLookback: (selectedLookback ?? defaultLookback) as LookbackPeriod,
		selectedTags: selectedTags ?? [],
		searchQuery: searchQuery ?? "",
	};
}

export function usePageFilterSetters() {
	const [, setSelectedModel] = useQueryState("model", modelParser);
	const [, setSelectedLookback] = useQueryState("lookback", lookbackParser);
	const [, setSelectedTags] = useQueryState("tags", tagsParser);
	const [, setSearchQuery] = useQueryState("q", searchParser);

	return {
		setSelectedModel: (model: ModelType) => setSelectedModel(model),
		setSelectedLookback: (lookback: LookbackPeriod) => setSelectedLookback(lookback),
		setSelectedTags,
		setSearchQuery,
		clearFilters: () => {
			setSelectedTags(null);
			setSearchQuery(null);
		},
	};
}
