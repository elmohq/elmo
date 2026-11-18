/**
 * What a brand's tracked models do with a market, and what one more prompt in
 * it costs: the facts the country picker shows before anyone commits to one.
 */
import type { Market } from "@workspace/config/markets";
import { PROJECTION_DAYS_PER_MONTH } from "@workspace/lib/usage";

export interface MarketTarget {
	/** The model filter value, which is what labels and icons are keyed by. */
	value: string;
	runsPerDay: number;
	/** Provider calls per run. */
	replication: number;
	/** Countries this target can't answer from, so it skips prompts asked there. */
	unsupportedCountries: string[];
	/** A model called without web search: its answer has no location, so it runs everywhere. */
	locationFree: boolean;
	/** Self-hosted only: the estimated provider bill per call. */
	costPerRunUsd: number | null;
}

export interface MarketSupport {
	brandMarket: Market;
	targets: MarketTarget[];
	/** Set where prompts come out of a plan's allowance rather than provider bills. */
	promptAllowance: { used: number; max: number } | null;
}

export type TargetMarketStatus = "localized" | "location-free" | "skipped";

export function targetStatusIn(target: MarketTarget, country: string): TargetMarketStatus {
	if (target.locationFree) return "location-free";
	return target.unsupportedCountries.includes(country) ? "skipped" : "localized";
}

export function targetsRunningIn(support: MarketSupport, country: string): MarketTarget[] {
	return support.targets.filter((target) => targetStatusIn(target, country) !== "skipped");
}

export interface PromptCost {
	callsPerDay: number;
	/** Null when no target has a price estimate, which is everywhere but self-hosted. */
	monthlyUsd: number | null;
}

export function promptCostIn(support: MarketSupport, country: string): PromptCost {
	const running = targetsRunningIn(support, country);
	const callsPerDay = running.reduce((total, target) => total + target.runsPerDay * target.replication, 0);
	const priced = running.filter((target) => target.costPerRunUsd !== null);
	const monthlyUsd =
		priced.length === 0
			? null
			: priced.reduce(
					(total, target) =>
						total + (target.costPerRunUsd ?? 0) * target.runsPerDay * target.replication * PROJECTION_DAYS_PER_MONTH,
					0,
				);
	return { callsPerDay, monthlyUsd };
}
