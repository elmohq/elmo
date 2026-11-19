/**
 * What a brand's tracked models are told about a prompt's country and
 * language, and what one more prompt costs.
 */
import type { Market } from "@workspace/config/markets";
import { PROJECTION_DAYS_PER_MONTH } from "@workspace/lib/usage";

export interface MarketTarget {
	/** The model filter value, which is what labels and icons are keyed by. */
	value: string;
	runsPerDay: number;
	/** Provider calls per run. */
	replication: number;
	/** A model called without web search: its answer has no location. */
	locationFree: boolean;
	/** Countries its provider can't be told, where it answers from the provider's default instead. */
	defaultLocationCountries: string[];
	/** Whether the language is sent as a setting, beyond the prompt being written in it. */
	sendsLanguage: boolean;
	/** Self-hosted only: the estimated provider bill per call. */
	costPerRunUsd: number | null;
}

export interface MarketSupport {
	brandMarket: Market;
	/** The countries the brand's enabled prompts are asked from, the brand's own first. */
	countriesInUse: string[];
	targets: MarketTarget[];
	/** Set where prompts come out of a plan's allowance rather than provider bills. */
	promptAllowance: { used: number; max: number } | null;
}

export interface PromptCost {
	callsPerDay: number;
	/** Null when no target has a price estimate, which is everywhere but self-hosted. */
	monthlyUsd: number | null;
}

export function promptCost(support: MarketSupport): PromptCost {
	const callsPerDay = support.targets.reduce((total, target) => total + target.runsPerDay * target.replication, 0);
	const priced = support.targets.filter((target) => target.costPerRunUsd !== null);
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
