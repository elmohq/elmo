import { useSearch } from "@tanstack/react-router";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { CalendarRange } from "lucide-react";
import { useMemo, useState } from "react";
import { CustomRangeForm, formatLookbackLabel } from "@/components/lookback-picker";
import { useBrand } from "@/hooks/use-brands";
import { coerceLookback, useFilterNavigate } from "@/hooks/use-list-filters";
import { getDefaultLookbackPeriod } from "@/lib/chart-utils";
import {
	formatCustomLookback,
	LOOKBACK_PERIODS,
	type LookbackPeriod,
	type LookbackPreset,
	parseCustomLookback,
} from "@/lib/lookback";

const LOOKBACK_LABELS: Record<LookbackPreset, string> = {
	"1w": "1w",
	"1m": "1mo",
	"3m": "3mo",
	"6m": "6mo",
	"1y": "1yr",
	all: "all",
};

interface LookbackSelectorProps {
	defaultPeriod?: LookbackPeriod;
	onLookbackChange?: (lookback: LookbackPeriod) => void;
}

export function LookbackSelector({ defaultPeriod, onLookbackChange }: LookbackSelectorProps) {
	const { data: brand } = useBrand();
	const computedDefaultPeriod = useMemo(
		() => defaultPeriod ?? getDefaultLookbackPeriod(brand?.earliestDataDate),
		[defaultPeriod, brand?.earliestDataDate],
	);

	const urlLookback = useSearch({ strict: false, select: (s) => s.lookback });
	const setFilters = useFilterNavigate();
	const selectedLookback = coerceLookback(urlLookback, computedDefaultPeriod);

	const customRange = parseCustomLookback(selectedLookback);
	const [customOpen, setCustomOpen] = useState(false);

	const handleChange = (period: LookbackPeriod) => {
		setFilters({ lookback: period === computedDefaultPeriod ? undefined : period });
		onLookbackChange?.(period);
	};

	const segmentClass = (selected: boolean) =>
		`px-3 py-1 text-sm rounded cursor-pointer ${
			selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
		}`;

	return (
		<div className="flex rounded-md bg-muted p-1">
			{LOOKBACK_PERIODS.map((period) => (
				<button
					key={period}
					onClick={() => handleChange(period)}
					className={segmentClass(selectedLookback === period)}
					type="button"
				>
					{LOOKBACK_LABELS[period]}
				</button>
			))}
			<Popover open={customOpen} onOpenChange={setCustomOpen}>
				<PopoverTrigger
					render={
						<button
							type="button"
							className={`${segmentClass(customRange !== null)} flex items-center gap-1.5`}
							aria-label={customRange ? `Custom range: ${formatLookbackLabel(selectedLookback)}` : "Custom range"}
						>
							<CalendarRange className="size-3.5" />
							{customRange && formatLookbackLabel(selectedLookback)}
						</button>
					}
				/>
				<PopoverContent align="end" className="w-auto p-0">
					<CustomRangeForm
						initialRange={customRange ?? undefined}
						onApply={(range) => {
							handleChange(formatCustomLookback(range));
							setCustomOpen(false);
						}}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}

export function useLookbackPeriod(defaultPeriod?: LookbackPeriod) {
	const { data: brand } = useBrand();
	const computedDefaultPeriod = useMemo(
		() => defaultPeriod ?? getDefaultLookbackPeriod(brand?.earliestDataDate),
		[defaultPeriod, brand?.earliestDataDate],
	);

	const urlLookback = useSearch({ strict: false, select: (s) => s.lookback });
	return coerceLookback(urlLookback, computedDefaultPeriod);
}
