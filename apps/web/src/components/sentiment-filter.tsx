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
	SENTIMENT_STYLES,
	SENTIMENTS,
	type Sentiment,
	type SentimentFilter,
	type SentimentFilterCounts,
	sentimentTotal,
} from "@/lib/sentiment";

const percent = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;

export function SentimentBar({
	counts,
	selected,
	onSelect,
	className,
}: {
	counts: Record<Sentiment, number>;
	selected?: SentimentFilter;
	onSelect?: (sentiment: Sentiment) => void;
	className?: string;
}) {
	const total = sentimentTotal(counts);
	if (total === 0) return <div className={cn("h-2 w-full rounded-full bg-muted", className)} />;
	return (
		<div className={cn("flex h-2 w-full gap-[3px]", className)}>
			{SENTIMENTS.filter((sentiment) => counts[sentiment] > 0).map((sentiment) => {
				const style = { flexGrow: counts[sentiment] / total, background: SENTIMENT_STYLES[sentiment].color };
				const segment = cn(
					"min-w-1 basis-0 rounded-full transition-opacity",
					selected && selected !== sentiment && "opacity-25",
				);
				const label = `${SENTIMENT_STYLES[sentiment].label}: ${percent(counts[sentiment], total)}`;
				return onSelect ? (
					// A mouse shortcut: the legend below is the same control for keyboards and screen readers.
					<button
						key={sentiment}
						type="button"
						tabIndex={-1}
						aria-hidden
						title={label}
						onClick={() => onSelect(sentiment)}
						className={cn(segment, "cursor-pointer")}
						style={style}
					/>
				) : (
					<div key={sentiment} title={label} className={segment} style={style} />
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

/** Choosing a segment or legend entry filters the list to that sentiment; choosing it again clears the filter. */
export function SentimentFilterCard({
	counts,
	value,
	onChange,
	sort,
	onSortChange,
}: {
	counts: SentimentFilterCounts;
	value?: SentimentFilter;
	onChange: (sentiment: SentimentFilter | undefined) => void;
	sort: ResponseSort;
	onSortChange: (sort: ResponseSort) => void;
}) {
	const toggle = (sentiment: SentimentFilter) => onChange(value === sentiment ? undefined : sentiment);
	const clear = sentimentTotal(counts);
	return (
		<Card className="gap-0 py-4">
			<CardContent className="space-y-3">
				<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
					<div className="text-sm">
						{clear > 0 ? (
							<span className="font-semibold tabular-nums">{percent(counts.positive, clear)} positive</span>
						) : (
							<span className="font-semibold">No sentiment yet</span>
						)}
						<span className="text-muted-foreground"> across {counts.all.toLocaleString()} answers</span>
					</div>
					<ResponseSortDropdown value={sort} onChange={onSortChange} />
				</div>
				<SentimentBar counts={counts} selected={value === "unmentioned" ? undefined : value} onSelect={toggle} />
				<div className="-mx-2 flex flex-wrap items-center gap-0.5">
					{SENTIMENTS.map((sentiment) => (
						<FilterOption
							key={sentiment}
							active={value === sentiment}
							dimmed={Boolean(value) && value !== sentiment}
							onClick={() => toggle(sentiment)}
							dot={<span className="size-2 rounded-full" style={{ background: SENTIMENT_STYLES[sentiment].color }} />}
							label={SENTIMENT_STYLES[sentiment].label}
							count={counts[sentiment]}
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
