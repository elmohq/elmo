"use client";

import { useQueryState, parseAsStringLiteral } from "nuqs";
import type { LookbackPeriod } from "@/lib/chart-utils";

const lookbackParser = parseAsStringLiteral(["1w", "1m", "3m", "6m", "1y", "all"] as const);

function getLookbackLabel(lookback: LookbackPeriod): string {
	switch (lookback) {
		case "1w":
			return "1w";
		case "1m":
			return "1mo";
		case "3m":
			return "3mo";
		case "6m":
			return "6mo";
		case "1y":
			return "1yr";
		case "all":
			return "all";
	}
}

interface LookbackSelectorProps {
	defaultPeriod?: LookbackPeriod;
	onLookbackChange?: (lookback: LookbackPeriod) => void;
}

export function LookbackSelector({ defaultPeriod = "1w", onLookbackChange }: LookbackSelectorProps) {
	const [selectedLookback, setSelectedLookback] = useQueryState("lookback", lookbackParser.withDefault(defaultPeriod));

	const handleChange = (period: LookbackPeriod) => {
		setSelectedLookback(period);
		onLookbackChange?.(period);
	};

	return (
		<div className="flex rounded-md bg-muted p-1">
			{(["1w", "1m", "3m", "6m", "1y", "all"] as LookbackPeriod[]).map((period) => (
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
					{getLookbackLabel(period)}
				</button>
			))}
		</div>
	);
}

export function useLookbackPeriod(defaultPeriod: LookbackPeriod = "1w") {
	const [selectedLookback] = useQueryState("lookback", lookbackParser.withDefault(defaultPeriod));
	return selectedLookback;
}

