"use client";

import { useRef, useMemo, useState, useLayoutEffect, useEffect } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { CachedPromptChart } from "./cached-prompt-chart";
import { useOptionalChartDataContext } from "@/contexts/chart-data-context";
import type { LookbackPeriod } from "@/hooks/use-prompt-chart-data";

type ModelType = "openai" | "anthropic" | "google" | "all";

interface PromptItem {
	id: string;
	value: string;
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

	// Use prompts as-is (no longer grouping by category)
	const orderedPrompts = useMemo(() => prompts, [prompts]);

	// Measure the offset of the list from the top of the page
	useLayoutEffect(() => {
		if (listRef.current) {
			setScrollMargin(listRef.current.offsetTop);
		}
	}, []);

	// Create a stable key that changes when the prompts list changes
	const promptsKey = useMemo(() => {
		return orderedPrompts.map(p => p.id).join(",");
	}, [orderedPrompts]);

	// Track chart loading state
	const isChartLoading = chartContext?.isLoading ?? true;

	const virtualizer = useWindowVirtualizer({
		count: orderedPrompts.length,
		// Use a consistent estimate - the measureElement ref will get actual heights
		estimateSize: () => FULL_CHART_HEIGHT + CHART_GAP,
		overscan: 3, // Render 3 extra items above and below viewport
		scrollMargin,
	});

	// Force virtualizer to recalculate when:
	// 1. Prompts list changes (e.g., after filtering)
	// 2. Chart data finishes loading (actual heights are now known)
	useEffect(() => {
		// Small delay to ensure DOM has updated with new content
		const timer = setTimeout(() => {
			virtualizer.measure();
		}, 50);
		return () => clearTimeout(timer);
	}, [virtualizer, promptsKey, isChartLoading]);

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
