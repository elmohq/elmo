import { useEffect, useMemo } from "react";
import { useSearch } from "@tanstack/react-router";
import { type LookbackPeriod, getDefaultLookbackPeriod } from "@/lib/chart-utils";
import { useBrand } from "@/hooks/use-brands";
import { coerceLookback, useFilterNavigate } from "@/hooks/use-list-filters";

// Persist the user's last lookback choice so it becomes the default on their
// next visit (issue #49). Stored per-brand and read client-side only.
const REMEMBERED_LOOKBACK_PERIODS: readonly LookbackPeriod[] = ["1w", "1m", "3m", "6m", "1y", "all"];

function lookbackStorageKey(brandId: string | undefined): string {
	return brandId ? `elmo:lookback:${brandId}` : "elmo:lookback";
}

function readRememberedLookback(key: string): LookbackPeriod | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(key);
		return raw && (REMEMBERED_LOOKBACK_PERIODS as readonly string[]).includes(raw)
			? (raw as LookbackPeriod)
			: null;
	} catch {
		return null;
	}
}

function writeRememberedLookback(key: string, period: LookbackPeriod): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(key, period);
	} catch {
		// Ignore storage failures (private mode, quota, disabled storage).
	}
}

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

export function LookbackSelector({ defaultPeriod, onLookbackChange }: LookbackSelectorProps) {
	const { brand } = useBrand();
	const computedDefaultPeriod = useMemo(
		() => defaultPeriod ?? getDefaultLookbackPeriod(brand?.earliestDataDate),
		[defaultPeriod, brand?.earliestDataDate]
	);

	const urlLookback = useSearch({ strict: false, select: (s) => s.lookback });
	const setFilters = useFilterNavigate();
	const selectedLookback = coerceLookback(urlLookback, computedDefaultPeriod);

	const storageKey = lookbackStorageKey(brand?.id);

	// On first load, when the URL doesn't pin a lookback, fall back to the user's
	// remembered choice (clamped to available data). Runs client-side only, after
	// hydration, so it never diverges from SSR output; an explicit URL always wins,
	// and an explicit `defaultPeriod` override opts out of remembering entirely.
	useEffect(() => {
		if (defaultPeriod || urlLookback) return;
		const remembered = readRememberedLookback(storageKey);
		if (!remembered) return;
		const desired = getDefaultLookbackPeriod(brand?.earliestDataDate, remembered);
		if (desired !== computedDefaultPeriod) {
			setFilters({ lookback: desired });
		}
	}, [defaultPeriod, urlLookback, storageKey, brand?.earliestDataDate, computedDefaultPeriod, setFilters]);

	const handleChange = (period: LookbackPeriod) => {
		writeRememberedLookback(storageKey, period);
		setFilters({ lookback: period === computedDefaultPeriod ? undefined : period });
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

export function useLookbackPeriod(defaultPeriod?: LookbackPeriod) {
	const { brand } = useBrand();
	const computedDefaultPeriod = useMemo(
		() => defaultPeriod ?? getDefaultLookbackPeriod(brand?.earliestDataDate),
		[defaultPeriod, brand?.earliestDataDate]
	);

	const urlLookback = useSearch({ strict: false, select: (s) => s.lookback });
	return coerceLookback(urlLookback, computedDefaultPeriod);
}
