import { Button } from "@workspace/ui/components/button";
import { Calendar } from "@workspace/ui/components/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { CalendarRange, Check, ChevronLeft } from "lucide-react";
import { type ReactElement, useState } from "react";
import {
	type DateRange,
	formatCustomLookback,
	LOOKBACK_PERIODS,
	type LookbackPeriod,
	type LookbackPreset,
	parseCustomLookback,
} from "@/lib/lookback";

const PRESET_LABELS: Record<LookbackPreset, string> = {
	"1w": "Last 7 days",
	"1m": "Last 30 days",
	"3m": "Last 3 months",
	"6m": "Last 6 months",
	"1y": "Last 12 months",
	all: "All time",
};

// Calendar days are bare dates: read and write them in UTC so the viewer's
// offset can never move a range end onto the neighbouring day.
const rangeFormatter = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});

export function formatLookbackLabel(lookback: LookbackPeriod): string {
	const custom = parseCustomLookback(lookback);
	if (!custom) return PRESET_LABELS[lookback as LookbackPreset];
	return rangeFormatter.formatRange(new Date(`${custom.from}T00:00:00Z`), new Date(`${custom.to}T00:00:00Z`));
}

// react-day-picker works in local Dates; the range is plain YYYY-MM-DD.
function toLocalDate(date: string): Date {
	const [year, month, day] = date.split("-").map(Number);
	return new Date(year, month - 1, day);
}

function toDateString(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfToday(): Date {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** A start and an end date picker, each constrained by the other, so either
 *  end of the range can be moved on its own. Both highlight the full range. */
export function CustomRangeForm({
	initialRange,
	onApply,
	onCancel,
}: {
	initialRange?: DateRange;
	onApply: (range: DateRange) => void;
	onCancel?: () => void;
}) {
	const today = startOfToday();
	const [from, setFrom] = useState<Date | undefined>(() => (initialRange ? toLocalDate(initialRange.from) : undefined));
	const [to, setTo] = useState<Date | undefined>(() => (initialRange ? toLocalDate(initialRange.to) : undefined));

	const rangeModifiers = {
		range_start: from,
		range_end: to,
		range_middle: from && to ? { after: from, before: to } : undefined,
	};

	return (
		<div className="flex flex-col">
			<div className="flex flex-col sm:flex-row sm:divide-x">
				<section aria-label="Start date" className="flex flex-col">
					<h3 className="px-3 pt-3 text-xs font-medium text-muted-foreground">Start date</h3>
					<Calendar
						mode="single"
						selected={from}
						onSelect={setFrom}
						defaultMonth={from ?? to ?? today}
						disabled={[{ after: to ?? today }]}
						modifiers={rangeModifiers}
					/>
				</section>
				<section aria-label="End date" className="flex flex-col">
					<h3 className="px-3 pt-3 text-xs font-medium text-muted-foreground">End date</h3>
					<Calendar
						mode="single"
						selected={to}
						onSelect={setTo}
						defaultMonth={to ?? today}
						disabled={[{ after: today }, ...(from ? [{ before: from }] : [])]}
						modifiers={rangeModifiers}
					/>
				</section>
			</div>
			<div className="flex items-center justify-between gap-2 border-t p-3">
				{onCancel ? (
					<Button variant="ghost" size="sm" onClick={onCancel} className="cursor-pointer">
						<ChevronLeft className="size-3.5" />
						Back
					</Button>
				) : (
					<span />
				)}
				<Button
					size="sm"
					disabled={!from || !to}
					onClick={() => from && to && onApply({ from: toDateString(from), to: toDateString(to) })}
					className="cursor-pointer"
				>
					Apply
				</Button>
			</div>
		</div>
	);
}

/** Preset list plus a "Custom range" view with start/end date pickers.
 *  Controlled: the caller owns where the value lives (the URL, in the app). */
export function LookbackPicker({
	value,
	onChange,
	trigger,
	align = "start",
}: {
	value: LookbackPeriod;
	onChange: (lookback: LookbackPeriod) => void;
	trigger: ReactElement;
	align?: "start" | "center" | "end";
}) {
	const [open, setOpen] = useState(false);
	const customRange = parseCustomLookback(value);
	const [view, setView] = useState<"presets" | "custom">("presets");

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		// Reopen on whatever is currently selected.
		if (next) setView(customRange ? "custom" : "presets");
	};

	const choose = (next: LookbackPeriod) => {
		onChange(next);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger render={trigger} />
			<PopoverContent align={align} className="w-auto p-0">
				{view === "presets" ? (
					<div role="listbox" aria-label="Date range" className="w-48 py-1">
						{LOOKBACK_PERIODS.map((period) => (
							<PickerOption key={period} selected={value === period} onClick={() => choose(period)}>
								{PRESET_LABELS[period]}
							</PickerOption>
						))}
						<div className="my-1 border-t" />
						<PickerOption selected={customRange !== null} onClick={() => setView("custom")}>
							<CalendarRange className="size-3.5 text-muted-foreground" />
							Custom range…
						</PickerOption>
					</div>
				) : (
					<CustomRangeForm
						initialRange={customRange ?? undefined}
						onApply={(range) => choose(formatCustomLookback(range))}
						onCancel={() => setView("presets")}
					/>
				)}
			</PopoverContent>
		</Popover>
	);
}

function PickerOption({
	selected,
	onClick,
	children,
}: {
	selected: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			role="option"
			aria-selected={selected}
			onClick={onClick}
			className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
		>
			{children}
			{selected && <Check className="ml-auto size-3.5" />}
		</button>
	);
}
