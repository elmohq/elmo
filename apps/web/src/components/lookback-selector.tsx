import { useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { useBrand } from "@/hooks/use-brands";
import { coerceLookback, useFilterNavigate } from "@/hooks/use-list-filters";
import { getDefaultLookbackPeriod } from "@/lib/chart-utils";
import { LOOKBACK_PERIODS, type LookbackPeriod } from "@/lib/lookback";

const LOOKBACK_LABELS: Record<LookbackPeriod, string> = {
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

	const handleChange = (period: LookbackPeriod) => {
		setFilters({ lookback: period === computedDefaultPeriod ? undefined : period });
		onLookbackChange?.(period);
	};

	return (
		<div className="flex rounded-md bg-muted p-1">
			{LOOKBACK_PERIODS.map((period) => (
				<button
					key={period}
					onClick={() => handleChange(period)}
					className={`px-3 py-1 text-sm rounded cursor-pointer ${
						selectedLookback === period
							? "bg-background text-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground"
					}`}
					type="button"
				>
					{LOOKBACK_LABELS[period]}
				</button>
			))}
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
