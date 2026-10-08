import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { countryName } from "@workspace/config/countries";
import { languageName } from "@workspace/config/languages";
import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import type { LookbackPeriod } from "@/lib/lookback";
import { marketLabel } from "@/lib/prompt-markets";
import { CachedPromptChart } from "./cached-prompt-chart";

interface PromptItem {
	id: string;
	value: string;
	country?: string;
	language?: string;
	groupId?: string;
	// All-time first evaluation date (null if never evaluated)
	// Note: Date objects are serialized to strings in JSON responses
	firstEvaluatedAt?: Date | string | null;
}

interface VirtualizedPromptListProps {
	prompts: PromptItem[];
	brandId: string;
	lookback: LookbackPeriod;
	/** Current model filter ("all" means no filter). */
	selectedModel: string;
	/** Concrete model ids this brand runs — no "all" sentinel. */
	availableModels: string[];
	searchHighlight?: string;
	/** Enabled members per group, across the whole brand rather than the filtered list. */
	groupSizes: ReadonlyMap<string, number>;
}

// All chart cards use a uniform height (empty states match chart height via h-[250px])
const CHART_CARD_HEIGHT = 380;
const CHART_GAP = 24; // px - gap between cards (space-y-6)

// Memoized so react-query `isFetching` state changes on the parent
// (which re-render prompts-display but leave these props untouched) don't
// cascade into 30+ CachedPromptChart re-renders.
export const VirtualizedPromptList = memo(function VirtualizedPromptList({
	prompts,
	brandId,
	lookback,
	selectedModel,
	availableModels,
	searchHighlight = "",
	groupSizes,
}: VirtualizedPromptListProps) {
	const listRef = useRef<HTMLDivElement>(null);
	const [scrollMargin, setScrollMargin] = useState(0);

	const orderedPrompts = prompts;
	// Labelled only when the list mixes markets or has groups; a single-market
	// list (or one filtered to a market) would just repeat the same code.
	const showMarket =
		new Set(prompts.map((prompt) => `${prompt.country}|${prompt.language}`)).size > 1 ||
		prompts.some((prompt) => (groupSizes.get(prompt.groupId ?? "") ?? 1) > 1);

	useLayoutEffect(() => {
		if (listRef.current) {
			setScrollMargin(listRef.current.offsetTop);
		}
	}, []);

	// Uniform height estimate — all cards (loading, empty, full) have matching content areas
	const estimateSize = useCallback(() => CHART_CARD_HEIGHT + CHART_GAP, []);

	const getItemKey = useCallback((index: number) => orderedPrompts[index].id, [orderedPrompts]);

	const virtualizer = useWindowVirtualizer({
		count: orderedPrompts.length,
		estimateSize,
		getItemKey,
		overscan: 3, // Render 3 extra items above and below viewport
		scrollMargin,
	});

	const virtualItems = virtualizer.getVirtualItems();

	return (
		<div ref={listRef} className="space-y-6">
			<div
				style={{
					height: `${virtualizer.getTotalSize()}px`,
					width: "100%",
					position: "relative",
				}}
			>
				{virtualItems.map((virtualItem) => {
					const prompt = orderedPrompts[virtualItem.index];

					return (
						<div
							key={prompt.id}
							data-index={virtualItem.index}
							ref={virtualizer.measureElement}
							style={{
								position: "absolute",
								top: 0,
								left: 0,
								width: "100%",
								transform: `translateY(${virtualItem.start - scrollMargin}px)`,
								contain: "layout style",
							}}
						>
							<div style={{ paddingBottom: CHART_GAP }}>
								<CachedPromptChart
									promptId={prompt.id}
									promptName={prompt.value}
									market={
										showMarket && prompt.country && prompt.language
											? {
													label: marketLabel({ country: prompt.country, language: prompt.language }),
													title: `${countryName(prompt.country)}, ${languageName(prompt.language)}`,
													variants: groupSizes.get(prompt.groupId ?? "") ?? 1,
												}
											: undefined
									}
									brandId={brandId}
									lookback={lookback}
									selectedModel={selectedModel}
									availableModels={availableModels}
									searchHighlight={searchHighlight}
									hasEverBeenEvaluated={Boolean(prompt.firstEvaluatedAt)}
								/>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
});
