import { useSearch } from "@tanstack/react-router";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@workspace/ui/components/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { ChevronDown, Clock, Search, Tag as TagIcon, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { MdSelectAll } from "react-icons/md";
import { useBrand } from "@/hooks/use-brands";
import { getDefaultLookbackPeriod, type LookbackPeriod } from "@/lib/chart-utils";

export { ALL_MODELS_VALUE, getAvailableModels } from "@/lib/model-filter";

// Filter state lives in the URL, validated by the `$brand` layout route's
// search schema (see `validateBrandFilterSearch`). The widgets here keep
// per-key `useSearch` selectors so one filter's click doesn't re-render the
// others, and write through `useFilterNavigate` (replace, no scroll reset).
// The router commits search updates synchronously within the interaction, so
// the URL itself is the authoritative filter state.
import { coerceLookback, joinTags, splitTags, useFilterNavigate } from "@/hooks/use-list-filters";
import {
	ALL_MODELS_VALUE,
	getAvailableModels,
	groupTrackedTargets,
	iconIdForModelFilter,
	labelForModelFilter,
	type TrackedTarget,
} from "@/lib/model-filter";

/** "all" is the no-filter sentinel; any other string is a concrete model id
 *  from the deployment's `SCRAPE_TARGETS`. Deployments can configure arbitrary
 *  model ids, so we don't constrain this to a literal union. */
export type ModelFilterValue = string;

/** The model filter's trigger glyph. `all` is the no-filter sentinel; every
 *  other value names one of the brand's targets, whose logo is decided by
 *  @workspace/config/models. */
export function iconForModel(model: string, className = "size-3.5") {
	if (model === ALL_MODELS_VALUE) return <MdSelectAll className={className} />;
	return <ModelIcon iconId={iconIdForModelFilter(model)} className={className} />;
}

export function labelForModel(model: string): string {
	return labelForModelFilter(model);
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

// ------------------------------------------------------------------
// Trigger button (used by every dropdown)
// ------------------------------------------------------------------

type FilterTriggerButtonProps = {
	icon: ReactNode;
	label: string;
	active?: boolean;
	badgeCount?: number;
} & React.ComponentProps<"button">;

// Props forward to the underlying Button so a trigger's `render` prop can hand
// its ref and state straight to the button element (wrapping in a div would
// leave the trigger targeting the div instead).
// Exported so page-specific bar controls (e.g. the prompts sort dropdown)
// share the same trigger look without re-implementing it.
export function FilterTriggerButton({
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

export function ModelDropdown({ trackedTargets }: { trackedTargets: TrackedTarget[] }) {
	const availableModels = getAvailableModels(trackedTargets);
	const defaultModel = availableModels.includes(ALL_MODELS_VALUE)
		? ALL_MODELS_VALUE
		: (availableModels[0] ?? ALL_MODELS_VALUE);
	const urlModel = useSearch({ strict: false, select: (s) => s.model });
	const setFilters = useFilterNavigate();
	// If the URL has a model that isn't valid for this brand (e.g. stale deep
	// link after a deployment change), fall back to the default rather than
	// showing a trigger with an unknown value.
	const selected = urlModel && availableModels.includes(urlModel) ? urlModel : defaultModel;

	const handleChange = (next: string) => {
		setFilters({ model: next === defaultModel ? undefined : next });
	};

	if (availableModels.length <= 1) return null;
	const isFiltered = selected !== ALL_MODELS_VALUE;
	// Grouped the way the LLM settings page groups them: a scraped surface, a
	// bare API call and a grounded one answer different questions, and the list
	// is long enough that a flat run of thirteen reads as undifferentiated.
	const groups = groupTrackedTargets(trackedTargets);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<FilterTriggerButton icon={iconForModel(selected)} label={labelForModel(selected)} active={isFiltered} />
				}
			/>
			<DropdownMenuContent align="start" className="w-56">
				<DropdownMenuRadioGroup value={selected} onValueChange={handleChange}>
					<DropdownMenuRadioItem value={ALL_MODELS_VALUE} className="cursor-pointer gap-2">
						{iconForModel(ALL_MODELS_VALUE)}
						{labelForModel(ALL_MODELS_VALUE)}
					</DropdownMenuRadioItem>
					{groups.map((group) => (
						<DropdownMenuGroup key={group.tier}>
							<DropdownMenuLabel className="text-muted-foreground text-xs font-medium">{group.label}</DropdownMenuLabel>
							{group.values.map((value) => (
								<DropdownMenuRadioItem key={value} value={value} className="cursor-pointer gap-2">
									{iconForModel(value)}
									{labelForModel(value)}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuGroup>
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
	const defaultLookback = useMemo(() => getDefaultLookbackPeriod(brand?.earliestDataDate), [brand?.earliestDataDate]);
	const urlLookback = useSearch({ strict: false, select: (s) => s.lookback });
	const setFilters = useFilterNavigate();
	const selected = coerceLookback(urlLookback, defaultLookback);

	const handleChange = (next: LookbackPeriod) => {
		setFilters({ lookback: next === defaultLookback ? undefined : next });
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<FilterTriggerButton icon={<Clock className="size-3.5" />} label={getLookbackLabel(selected)} />}
			/>
			<DropdownMenuContent align="start" className="w-48">
				<DropdownMenuRadioGroup value={selected} onValueChange={(v) => handleChange(v as LookbackPeriod)}>
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
	const urlTags = useSearch({ strict: false, select: (s) => s.tags });
	const setFilters = useFilterNavigate();
	const selected = useMemo(() => splitTags(urlTags), [urlTags]);

	const commit = (next: string[]) => {
		setFilters({ tags: joinTags(next) });
	};
	const toggle = (tag: string) => {
		commit(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]);
	};

	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen} modal={false}>
			<PopoverTrigger
				render={
					<FilterTriggerButton
						icon={<TagIcon className="size-3.5" />}
						label="Tags"
						active={selected.length > 0}
						badgeCount={selected.length > 0 ? selected.length : undefined}
					/>
				}
			/>
			<PopoverContent align="start" className="w-64 p-0" initialFocus={false}>
				<div className="flex items-center justify-between px-3 h-10 border-b">
					<span className="font-medium text-sm">Tags</span>
					{selected.length > 0 && (
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
							const checked = selected.includes(tag);
							return (
								<button
									key={tag}
									type="button"
									onClick={(e) => {
										// Keep the popover open so several tags can be picked at once.
										e.preventDefault();
										e.stopPropagation();
										toggle(tag);
									}}
									className={`flex w-full items-center gap-2.5 py-1.5 px-3 cursor-pointer text-left text-sm ${
										checked ? "bg-accent" : "hover:bg-muted"
									}`}
								>
									<Checkbox checked={checked} className="pointer-events-none" />
									<span className="capitalize flex-1">{tag}</span>
								</button>
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
	const urlValue = useSearch({ strict: false, select: (s) => s.q });
	const setFilters = useFilterNavigate();
	const value = urlValue ?? "";

	const [local, setLocal] = useState(value);
	// Ignore the URL echo while a local value is being committed; otherwise an
	// intervening render can restore stale text and make the input flash.
	const pendingTargetRef = useRef<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: the URL is the trigger; re-running on every keystroke would fight the debounce below
	useEffect(() => {
		if (pendingTargetRef.current !== null) {
			if (value === pendingTargetRef.current) {
				pendingTargetRef.current = null; // our push committed
				return;
			}
			// The URL moved to something other than what we were pushing —
			// an external clearFilters() or direct navigation wins.
			pendingTargetRef.current = null;
			setLocal(value);
			return;
		}
		if (value !== local) setLocal(value);
	}, [value]);

	useEffect(() => {
		if (local === value) return;
		if (local === pendingTargetRef.current) return;
		const timer = setTimeout(() => {
			pendingTargetRef.current = local;
			setFilters({ q: local.length ? local : undefined });
		}, 250);
		return () => clearTimeout(timer);
	}, [local, value, setFilters]);

	const clear = () => {
		setLocal("");
		if (value !== "") {
			pendingTargetRef.current = "";
			setFilters({ q: undefined });
		} else {
			pendingTargetRef.current = null;
		}
	};

	return (
		<InputGroup className="h-8 sm:w-64">
			<InputGroupInput
				value={local}
				onChange={(e) => setLocal(e.target.value)}
				placeholder={placeholder}
				className="h-8 text-sm"
			/>
			<InputGroupAddon className="pl-2.5">
				<Search className="size-3.5" />
			</InputGroupAddon>
			{local && (
				<InputGroupAddon align="inline-end" className="pr-1.5">
					<InputGroupButton size="icon-xs" onClick={clear} className="cursor-pointer" aria-label="Clear search">
						<X className="size-3.5" />
					</InputGroupButton>
				</InputGroupAddon>
			)}
		</InputGroup>
	);
}

// ------------------------------------------------------------------
// Result count — subscribes only to the two URL keys that gate its
// visibility (tags + q). Parent passes the count as a prop so the
// prompts-summary query is read once by a single owner.
// ------------------------------------------------------------------

export function ResultCount({ count, total }: { count: number | undefined; total?: number }) {
	const tags = useSearch({ strict: false, select: (s) => s.tags });
	const q = useSearch({ strict: false, select: (s) => s.q });
	const active = Boolean(tags) || Boolean(q);
	if (!active || count === undefined) return null;
	const showTotal = total !== undefined && total !== count;
	return (
		<span className="text-xs text-muted-foreground tabular-nums ml-1">
			{count.toLocaleString()}
			{showTotal && ` of ${total.toLocaleString()}`} {count === 1 && !showTotal ? "result" : "results"}
		</span>
	);
}

// ------------------------------------------------------------------
// Composed FilterBar
// ------------------------------------------------------------------

export function FilterBar({
	availableTags,
	trackedTargets,
	showSearch,
	showModelSelector,
	resultCount,
	resultTotal,
	extraControls,
}: {
	availableTags: readonly string[];
	trackedTargets: TrackedTarget[];
	showSearch: boolean;
	showModelSelector: boolean;
	/** Only passed by pages that filter a list; omit on pages with a single aggregate view (e.g. Citations). */
	resultCount?: number;
	/** Unfiltered count — when it differs from `resultCount` the line reads "n of m results". */
	resultTotal?: number;
	/** Page-specific controls rendered inline with the dropdown group
	 *  (e.g. the prompts list's sort dropdown). */
	extraControls?: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-2">
			<div className="flex flex-wrap items-center gap-1.5">
				{showModelSelector && <ModelDropdown trackedTargets={trackedTargets} />}
				<TagsDropdown availableTags={availableTags} />
				<LookbackDropdown />
				{extraControls}
				<ResultCount count={resultCount} total={resultTotal} />
			</div>
			{showSearch && <SearchInput />}
		</div>
	);
}

// Data-fetching consumers that need the full filter set use
// `useListFilters` from "@/hooks/use-list-filters".
