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
import { Spinner } from "@workspace/ui/components/spinner";
import { ChevronDown, Clock, Search, Tag as TagIcon, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { MdSelectAll } from "react-icons/md";
import { formatLookbackLabel, LookbackPicker } from "@/components/lookback-picker";
import { useBrand } from "@/hooks/use-brands";
import { getDefaultLookbackPeriod } from "@/lib/chart-utils";
import { type LookbackPeriod, parseCustomLookback } from "@/lib/lookback";
import { BRAND_ROUTE_ID } from "@/lib/route-subject";

export { ALL_MODELS_VALUE } from "@workspace/config/model-filter";

import { ALL_MODELS_VALUE, iconIdForModelFilter, labelForModelFilter } from "@workspace/config/model-filter";
// Filter state lives only in the URL. Each widget selects just its own search
// key so one filter's click doesn't re-render the others.
import { coerceLookback, joinTags, splitTags, useFilterNavigate } from "@/hooks/use-list-filters";
import { getAvailableModels, groupTrackedTargets, type TrackedTarget } from "@/lib/model-filter";

function iconForModel(model: string, className = "size-3.5") {
	if (model === ALL_MODELS_VALUE) return <MdSelectAll className={className} />;
	return <ModelIcon iconId={iconIdForModelFilter(model)} className={className} />;
}

type FilterTriggerButtonProps = {
	icon: ReactNode;
	label: string;
	active?: boolean;
	badgeCount?: number;
} & React.ComponentProps<"button">;

// Props reach the Button itself so a trigger's `render` prop can hand it the ref;
// a wrapping div would become the trigger instead.
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

function ModelDropdown({ trackedTargets }: { trackedTargets: TrackedTarget[] }) {
	const availableModels = getAvailableModels(trackedTargets);
	const defaultModel = availableModels.includes(ALL_MODELS_VALUE)
		? ALL_MODELS_VALUE
		: (availableModels[0] ?? ALL_MODELS_VALUE);
	const urlModel = useSearch({ from: BRAND_ROUTE_ID, select: (s) => s.model });
	const setFilters = useFilterNavigate();
	// A stale deep link can name a model this brand no longer tracks.
	const selected = urlModel && availableModels.includes(urlModel) ? urlModel : defaultModel;

	const handleChange = (next: string) => {
		setFilters({ model: next === defaultModel ? undefined : next });
	};

	if (availableModels.length <= 1) return null;
	const isFiltered = selected !== ALL_MODELS_VALUE;
	// Scraped, API and grounded answer different questions, so they're grouped as on the LLMs page.
	const groups = groupTrackedTargets(trackedTargets);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<FilterTriggerButton
						icon={iconForModel(selected)}
						label={labelForModelFilter(selected)}
						active={isFiltered}
					/>
				}
			/>
			<DropdownMenuContent align="start" className="w-56">
				<DropdownMenuRadioGroup value={selected} onValueChange={handleChange}>
					<DropdownMenuRadioItem value={ALL_MODELS_VALUE} className="cursor-pointer gap-2">
						{iconForModel(ALL_MODELS_VALUE)}
						{labelForModelFilter(ALL_MODELS_VALUE)}
					</DropdownMenuRadioItem>
					{groups.map((group) => (
						<DropdownMenuGroup key={group.tier}>
							<DropdownMenuLabel className="text-muted-foreground text-xs font-medium">{group.label}</DropdownMenuLabel>
							{group.values.map((value) => (
								<DropdownMenuRadioItem key={value} value={value} className="cursor-pointer gap-2">
									{iconForModel(value)}
									{labelForModelFilter(value)}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuGroup>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function LookbackDropdown() {
	const { data: brand } = useBrand();
	const defaultLookback = useMemo(() => getDefaultLookbackPeriod(brand?.earliestDataDate), [brand?.earliestDataDate]);
	const urlLookback = useSearch({ from: BRAND_ROUTE_ID, select: (s) => s.lookback });
	const setFilters = useFilterNavigate();
	const selected = coerceLookback(urlLookback, defaultLookback);

	const handleChange = (next: LookbackPeriod) => {
		setFilters({ lookback: next === defaultLookback ? undefined : next });
	};

	return (
		<LookbackPicker
			value={selected}
			defaultValue={defaultLookback}
			onChange={handleChange}
			trigger={
				<FilterTriggerButton
					icon={<Clock className="size-3.5" />}
					label={formatLookbackLabel(selected)}
					active={parseCustomLookback(selected) !== null}
				/>
			}
		/>
	);
}

function TagsDropdown({ availableTags }: { availableTags: readonly string[] }) {
	const urlTags = useSearch({ from: BRAND_ROUTE_ID, select: (s) => s.tags });
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

function SearchInput({
	placeholder = "Search prompts...",
	searching = false,
}: {
	placeholder?: string;
	searching?: boolean;
}) {
	const urlValue = useSearch({ from: BRAND_ROUTE_ID, select: (s) => s.q });
	const setFilters = useFilterNavigate();
	const value = urlValue ?? "";

	const [local, setLocal] = useState(value);
	// Ignore the URL echo while a local value is being committed; otherwise an
	// intervening render can restore stale text and make the input flash.
	const pendingTargetRef = useRef<string | null>(null);

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
		setLocal(value);
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
				{searching ? <Spinner className="size-3.5" aria-label="Searching" /> : <Search className="size-3.5" />}
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

// The count comes in as a prop so the prompts-summary query has a single owner.
function ResultCount({ count, total }: { count: number | undefined; total?: number }) {
	const tags = useSearch({ from: BRAND_ROUTE_ID, select: (s) => s.tags });
	const q = useSearch({ from: BRAND_ROUTE_ID, select: (s) => s.q });
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

export function FilterBar({
	availableTags,
	trackedTargets,
	showSearch,
	searchPlaceholder,
	showModelSelector,
	resultCount,
	resultTotal,
	searching,
	extraControls,
}: {
	availableTags: readonly string[];
	trackedTargets: TrackedTarget[];
	showSearch: boolean;
	searchPlaceholder?: string;
	showModelSelector: boolean;
	/** Only passed by pages that filter a list; omit on pages with a single aggregate view (e.g. Citations). */
	resultCount?: number;
	/** Unfiltered count — when it differs from `resultCount` the line reads "n of m results". */
	resultTotal?: number;
	/** For searches slow enough that the input should show they're still running. */
	searching?: boolean;
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
			{showSearch && <SearchInput placeholder={searchPlaceholder} searching={searching} />}
		</div>
	);
}

// Data-fetching consumers that need the full filter set use
// `useListFilters` from "@/hooks/use-list-filters".
