import { Button } from "@workspace/ui/components/button";
import { Calendar } from "@workspace/ui/components/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { CalendarIcon, CalendarRange, Check, ChevronLeft, X } from "lucide-react";
import { type ReactElement, type ReactNode, useState } from "react";
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
	const asDate = (date: string) => new Date(`${date}T00:00:00Z`);
	if (custom.from && custom.to) return rangeFormatter.formatRange(asDate(custom.from), asDate(custom.to));
	if (custom.from) return `Since ${rangeFormatter.format(asDate(custom.from))}`;
	return `Until ${rangeFormatter.format(asDate(custom.to as string))}`;
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

type Bound = "from" | "to";

/** Two independent date fields. Either may be left empty: a start alone means
 *  "since", an end alone means "until", both make a range. One calendar opens
 *  at a time, under the field it edits. */
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
	const [from, setFrom] = useState(() => (initialRange?.from ? toLocalDate(initialRange.from) : undefined));
	const [to, setTo] = useState(() => (initialRange?.to ? toLocalDate(initialRange.to) : undefined));
	// Fresh from a preset there is nothing to review, so go straight to picking.
	const [editing, setEditing] = useState<Bound | null>(initialRange ? null : "from");

	const toggle = (bound: Bound) => setEditing((current) => (current === bound ? null : bound));
	const pick = (set: (date: Date | undefined) => void) => (date: Date | undefined) => {
		set(date);
		if (date) setEditing(null);
	};

	return (
		<div className="flex w-72 flex-col">
			<div className="flex flex-col gap-2 p-3">
				<DateField
					label="Start date"
					placeholder="Earliest"
					value={from}
					open={editing === "from"}
					onToggle={() => toggle("from")}
					onClear={() => setFrom(undefined)}
				>
					<Calendar
						mode="single"
						selected={from}
						onSelect={pick(setFrom)}
						defaultMonth={from ?? to ?? today}
						disabled={{ after: to ?? today }}
					/>
				</DateField>
				<DateField
					label="End date"
					placeholder="Today"
					value={to}
					open={editing === "to"}
					onToggle={() => toggle("to")}
					onClear={() => setTo(undefined)}
				>
					<Calendar
						mode="single"
						selected={to}
						onSelect={pick(setTo)}
						defaultMonth={to ?? today}
						disabled={from ? [{ after: today }, { before: from }] : { after: today }}
					/>
				</DateField>
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
					disabled={!from && !to}
					onClick={() => onApply({ from: from ? toDateString(from) : null, to: to ? toDateString(to) : null })}
					className="cursor-pointer"
				>
					Apply
				</Button>
			</div>
		</div>
	);
}

function DateField({
	label,
	placeholder,
	value,
	open,
	onToggle,
	onClear,
	children,
}: {
	label: string;
	placeholder: string;
	value: Date | undefined;
	open: boolean;
	onToggle: () => void;
	onClear: () => void;
	children: ReactNode;
}) {
	const display = value ? rangeFormatter.format(new Date(`${toDateString(value)}T00:00:00Z`)) : placeholder;
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-2">
				<span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
				<div className="relative flex-1">
					<button
						type="button"
						onClick={onToggle}
						aria-expanded={open}
						aria-label={`${label}: ${display}`}
						className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-md border px-2.5 text-left text-sm ${
							open ? "border-ring ring-[3px] ring-ring/30" : "hover:bg-muted"
						}`}
					>
						<CalendarIcon className="size-3.5 text-muted-foreground" />
						<span className={value ? "" : "text-muted-foreground"}>{display}</span>
					</button>
					{value && (
						<button
							type="button"
							onClick={onClear}
							aria-label={`Clear ${label.toLowerCase()}`}
							className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground"
						>
							<X className="size-3.5" />
						</button>
					)}
				</div>
			</div>
			{open && <div className="flex justify-center">{children}</div>}
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
