/**
 * The filters that decide which prompts an analytics read covers. Server
 * functions spread `promptScopeFields` into their validators and hooks spread
 * `promptScopeParams`, so a filter added here reaches every page at once.
 */
import { type Market, marketId, parseMarketFilter, resolveMarket } from "@workspace/config/markets";
import { z } from "zod";

export const promptScopeFields = {
	/** Comma-joined tags; a prompt carrying any of them matches. */
	tags: z.string().optional(),
	/** Comma-joined market ids such as `de-DE`; a prompt asked in any of them matches. */
	markets: z.string().optional(),
};

export interface PromptScope {
	tags?: string;
	markets?: string;
}

export function promptScopeOf(data: PromptScope): PromptScope {
	return { tags: data.tags, markets: data.markets };
}

export interface PromptScopeFilters {
	tags?: string[];
	markets?: string[];
}

export function promptScopeParams(filters: PromptScopeFilters | undefined): PromptScope {
	return {
		tags: filters?.tags?.length ? filters.tags.join(",") : undefined,
		markets: filters?.markets?.length ? filters.markets.join(",") : undefined,
	};
}

/** Answers whether a prompt is asked in one of the filtered markets; with no filter, every prompt is. */
export function marketFilter(
	markets: string | undefined,
	brand: { country: string; language: string },
): (prompt: { country: string | null; language: string | null }) => boolean {
	const wanted = new Set(parseMarketFilter(markets).map(marketId));
	if (wanted.size === 0) return () => true;
	return (prompt) => wanted.has(marketId(resolveMarket(prompt, brand)));
}

export interface MarketUse extends Market {
	/** Enabled prompts asked in this market. */
	prompts: number;
}

/** The markets a brand's enabled prompts are asked in, the brand's own first and then the busiest. */
export function marketsInUse(
	brand: { country: string; language: string },
	prompts: readonly { enabled: boolean; country: string | null; language: string | null }[],
): MarketUse[] {
	const counts = new Map<string, MarketUse>();
	for (const prompt of prompts) {
		if (!prompt.enabled) continue;
		const market = resolveMarket(prompt, brand);
		const entry = counts.get(marketId(market)) ?? { ...market, prompts: 0 };
		entry.prompts += 1;
		counts.set(marketId(market), entry);
	}
	const own = marketId(brand);
	return [...counts.values()].sort(
		(a, b) =>
			Number(marketId(b) === own) - Number(marketId(a) === own) ||
			b.prompts - a.prompts ||
			marketId(a).localeCompare(marketId(b)),
	);
}
