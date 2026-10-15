import { Card, CardContent } from "@workspace/ui/components/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { FilterTriggerButton } from "@/components/filter-bar";
import {
	type ResponseSort,
	TONE_STYLES,
	TONES,
	type Tone,
	type ToneCounts,
	type ToneFilter,
	toneTotal,
} from "@/lib/tone";

const percent = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;

/**
 * Rounded segments with small gaps, one per tone that occurs. With `onSelect` each segment is a
 * button, and the ones not `selected` fade.
 */
export function ToneBar({
	counts,
	selected,
	onSelect,
	className,
}: {
	counts: Record<Tone, number>;
	selected?: ToneFilter;
	onSelect?: (tone: Tone) => void;
	className?: string;
}) {
	const total = toneTotal(counts);
	if (total === 0) return <div className={cn("h-2 w-full rounded-full bg-muted", className)} />;
	return (
		<div className={cn("flex h-2 w-full gap-[3px]", className)}>
			{TONES.filter((tone) => counts[tone] > 0).map((tone) => {
				const style = { flexGrow: counts[tone] / total, background: TONE_STYLES[tone].color };
				const segment = cn(
					"min-w-1 basis-0 rounded-full transition-opacity",
					selected && selected !== tone && "opacity-25",
				);
				const label = `${TONE_STYLES[tone].label}: ${percent(counts[tone], total)}`;
				return onSelect ? (
					<button
						key={tone}
						type="button"
						aria-label={label}
						title={label}
						onClick={() => onSelect(tone)}
						className={cn(segment, "cursor-pointer")}
						style={style}
					/>
				) : (
					<div key={tone} title={label} className={segment} style={style} />
				);
			})}
		</div>
	);
}

const SORT_LABELS: Record<ResponseSort, string> = {
	newest: "Newest first",
	negative: "Most negative first",
	positive: "Most positive first",
};

export function ResponseSortDropdown({
	value,
	onChange,
}: {
	value: ResponseSort;
	onChange: (sort: ResponseSort) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<FilterTriggerButton
						icon={<ArrowUpDown className="size-3.5" />}
						label={SORT_LABELS[value]}
						active={value !== "newest"}
					/>
				}
			/>
			<DropdownMenuContent align="end" className="w-52">
				<DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as ResponseSort)}>
					{(Object.keys(SORT_LABELS) as ResponseSort[]).map((sort) => (
						<DropdownMenuRadioItem key={sort} value={sort} className="cursor-pointer whitespace-nowrap">
							{SORT_LABELS[sort]}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function FilterOption({
	active,
	dimmed,
	onClick,
	dot,
	label,
	count,
}: {
	active: boolean;
	dimmed: boolean;
	onClick: () => void;
	dot: ReactNode;
	label: string;
	count: number;
}) {
	return (
		<button
			type="button"
			aria-pressed={active}
			onClick={onClick}
			className={cn(
				"inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors",
				active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
				dimmed && "opacity-60",
			)}
		>
			{dot}
			{label}
			<span className="tabular-nums text-muted-foreground">{count.toLocaleString()}</span>
		</button>
	);
}

/**
 * How a list of answers splits by tone toward the brand, doubling as its filter: a segment or its
 * legend entry narrows the list to that tone, and choosing it again clears the filter.
 */
export function ToneFilterCard({
	counts,
	value,
	onChange,
	sort,
	onSortChange,
}: {
	counts: ToneCounts;
	value?: ToneFilter;
	onChange: (tone: ToneFilter | undefined) => void;
	sort: ResponseSort;
	onSortChange: (sort: ResponseSort) => void;
}) {
	const toggle = (tone: ToneFilter) => onChange(value === tone ? undefined : tone);
	const clear = toneTotal(counts);
	return (
		<Card className="gap-0 py-4">
			<CardContent className="space-y-3">
				<div className="flex items-center justify-between gap-4">
					<div className="text-sm">
						{clear > 0 ? (
							<span className="font-semibold tabular-nums">{percent(counts.positive, clear)} positive</span>
						) : (
							<span className="font-semibold">No tone yet</span>
						)}
						<span className="text-muted-foreground"> across {counts.all.toLocaleString()} answers</span>
					</div>
					<ResponseSortDropdown value={sort} onChange={onSortChange} />
				</div>
				<ToneBar counts={counts} selected={value === "unmentioned" ? undefined : value} onSelect={toggle} />
				<div className="-mx-2 flex flex-wrap items-center gap-0.5">
					{TONES.map((tone) => (
						<FilterOption
							key={tone}
							active={value === tone}
							dimmed={Boolean(value) && value !== tone}
							onClick={() => toggle(tone)}
							dot={<span className="size-2 rounded-full" style={{ background: TONE_STYLES[tone].color }} />}
							label={TONE_STYLES[tone].label}
							count={counts[tone]}
						/>
					))}
					<span className="mx-1 h-4 w-px bg-border" />
					<FilterOption
						active={value === "unmentioned"}
						dimmed={Boolean(value) && value !== "unmentioned"}
						onClick={() => toggle("unmentioned")}
						dot={<span className="size-2 rounded-full border border-muted-foreground/60" />}
						label="Doesn't mention you"
						count={counts.unmentioned}
					/>
				</div>
			</CardContent>
		</Card>
	);
}
