"use client";

import { useRef, useMemo, useState, useLayoutEffect, useCallback } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { CachedPromptChart } from "./cached-prompt-chart";
import { useOptionalChartDataContext } from "@/contexts/chart-data-context";
import type { LookbackPeriod } from "@/hooks/use-prompt-chart-data";

type ModelType = "openai" | "anthropic" | "google" | "all";

interface PromptItem {
	id: string;
	value: string;
	groupCategory: string | null;
	groupPrefix: string | null;
}

interface VirtualizedPromptListProps {
	prompts: PromptItem[];
	brandId: string;
	lookback: LookbackPeriod;
	selectedModel: ModelType;
	availableModels: ("openai" | "anthropic" | "google")[];
	searchHighlight?: string;
}

// Heights for different chart states
const FULL_CHART_HEIGHT = 380; // Full chart with data
const SHORT_CHART_HEIGHT = 120; // "No brands found" or "Evaluating" states
const CHART_GAP = 24; // px - gap between cards (space-y-6)

export function VirtualizedPromptList({
	prompts,
	brandId,
	lookback,
	selectedModel,
	availableModels,
	searchHighlight = "",
}: VirtualizedPromptListProps) {
	const listRef = useRef<HTMLDivElement>(null);
	const [scrollMargin, setScrollMargin] = useState(0);
	const chartContext = useOptionalChartDataContext();

	// Preserve original ordering: uncategorized prompts first, then grouped prompts
	const orderedPrompts = useMemo(() => {
		const uncategorized = prompts.filter(
			(p) => !p.groupCategory || p.groupCategory === "Uncategorized"
		);
		const categorized = prompts.filter(
			(p) => p.groupCategory && p.groupCategory !== "Uncategorized"
		);
		return [...uncategorized, ...categorized];
	}, [prompts]);

	// Pre-calculate which prompts have full chart data vs short message
	const promptHeights = useMemo(() => {
		if (!chartContext || chartContext.isLoading) {
			// While loading, assume all are full height
			return new Map<string, number>();
		}

		const heights = new Map<string, number>();
		for (const prompt of orderedPrompts) {
			const data = chartContext.getChartDataForPrompt(prompt.id);
			if (!data || data.totalRuns === 0 || !data.hasVisibilityData) {
				// Short chart (no data, evaluating, or no brands found)
				heights.set(prompt.id, SHORT_CHART_HEIGHT + CHART_GAP);
			} else {
				// Full chart with data
				heights.set(prompt.id, FULL_CHART_HEIGHT + CHART_GAP);
			}
		}
		return heights;
	}, [chartContext, orderedPrompts]);

	// Measure the offset of the list from the top of the page
	useLayoutEffect(() => {
		if (listRef.current) {
			setScrollMargin(listRef.current.offsetTop);
		}
	}, []);

	// Estimate size based on whether we have chart data
	const estimateSize = useCallback((index: number) => {
		const prompt = orderedPrompts[index];
		return promptHeights.get(prompt.id) ?? (FULL_CHART_HEIGHT + CHART_GAP);
	}, [orderedPrompts, promptHeights]);

	const virtualizer = useWindowVirtualizer({
		count: orderedPrompts.length,
		estimateSize,
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
							}}
						>
							<div style={{ paddingBottom: CHART_GAP }}>
								<CachedPromptChart
									promptId={prompt.id}
									promptName={prompt.value}
									brandId={brandId}
									lookback={lookback}
									selectedModel={selectedModel}
									availableModels={availableModels}
									searchHighlight={searchHighlight}
								/>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
