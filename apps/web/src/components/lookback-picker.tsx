import { Calendar } from "@workspace/ui/components/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { CalendarIcon, Check, X } from "lucide-react";
import { type ComponentProps, type ReactElement, useState } from "react";
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

function monthBefore(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth() - 1, 1);
}

/** Start and end date fields, each optional and applied as soon as a day is
 *  picked: a start alone means "since", an end alone means "until", both make
 *  a range. `null` means both were cleared. */
export function CustomRangeFields({
	value,
	onChange,
}: {
	value: DateRange | null;
	onChange: (range: DateRange | null) => void;
}) {
	const today = startOfToday();
	const from = value?.from ? toLocalDate(value.from) : undefined;
	const to = value?.to ? toLocalDate(value.to) : undefined;

	const commit = (next: { from: Date | undefined; to: Date | undefined }) => {
		if (!next.from && !next.to) return onChange(null);
		onChange({
			from: next.from ? toDateString(next.from) : null,
			to: next.to ? toDateString(next.to) : null,
		});
	};

	return (
		<div className="flex flex-col gap-1.5">
			<DateField
				label="Start date"
				placeholder="Earliest"
				value={from}
				onChange={(date) => commit({ from: date, to })}
				// Open a month back so the picker isn't mostly days that can't be chosen yet.
				defaultMonth={monthBefore(to ?? today)}
				disabled={{ after: to ?? today }}
			/>
			<DateField
				label="End date"
				placeholder="Today"
				value={to}
				onChange={(date) => commit({ from, to: date })}
				defaultMonth={today}
				disabled={from ? [{ after: today }, { before: from }] : { after: today }}
			/>
		</div>
	);
}

function DateField({
	label,
	placeholder,
	value,
	onChange,
	defaultMonth,
	disabled,
}: {
	label: string;
	placeholder: string;
	value: Date | undefined;
	onChange: (date: Date | undefined) => void;
	defaultMonth: Date;
	disabled: ComponentProps<typeof Calendar>["disabled"];
}) {
	const [open, setOpen] = useState(false);
	const display = value ? rangeFormatter.format(new Date(`${toDateString(value)}T00:00:00Z`)) : placeholder;

	return (
		<div className="flex items-center gap-2">
			<span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
			<div className="relative min-w-0 flex-1">
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger
						render={
							<button
								type="button"
								aria-label={`${label}: ${display}`}
								className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-md border px-2.5 text-left text-sm ${
									open ? "border-ring ring-[3px] ring-ring/30" : "hover:bg-muted"
								}`}
							>
								<CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" />
								<span className={`truncate ${value ? "" : "text-muted-foreground"}`}>{display}</span>
							</button>
						}
					/>
					<PopoverContent side="right" align="start" sideOffset={12} className="w-auto p-0">
						<Calendar
							mode="single"
							selected={value}
							onSelect={(date) => {
								if (!date) return;
								onChange(date);
								setOpen(false);
							}}
							defaultMonth={value ?? defaultMonth}
							disabled={disabled}
						/>
					</PopoverContent>
				</Popover>
				{value && (
					<button
						type="button"
						onClick={() => onChange(undefined)}
						aria-label={`Clear ${label.toLowerCase()}`}
						className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground"
					>
						<X className="size-3.5" />
					</button>
				)}
			</div>
		</div>
	);
}

/** One menu: the presets, then start/end date fields beneath them. Picking a
 *  preset or a date applies immediately; clearing both dates falls back to
 *  `defaultValue`. Controlled: the caller owns where the value lives (the URL,
 *  in the app). */
export function LookbackPicker({
	value,
	defaultValue,
	onChange,
	trigger,
	align = "start",
}: {
	value: LookbackPeriod;
	defaultValue: LookbackPeriod;
	onChange: (lookback: LookbackPeriod) => void;
	trigger: ReactElement;
	align?: "start" | "center" | "end";
}) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger render={trigger} />
			<PopoverContent align={align} className="w-72 p-0">
				<div role="listbox" aria-label="Date range" className="py-1">
					{LOOKBACK_PERIODS.map((period) => (
						<button
							key={period}
							type="button"
							role="option"
							aria-selected={value === period}
							onClick={() => {
								onChange(period);
								setOpen(false);
							}}
							className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
						>
							{PRESET_LABELS[period]}
							{value === period && <Check className="ml-auto size-3.5" />}
						</button>
					))}
				</div>
				<div className="border-t p-3">
					<CustomRangeFields
						value={parseCustomLookback(value)}
						onChange={(range) => onChange(range ? formatCustomLookback(range) : defaultValue)}
					/>
				</div>
			</PopoverContent>
		</Popover>
	);
}
