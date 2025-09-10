"use client";
import { useEffect, useRef, useState } from "react";
import { PromptChartOptimized } from "./prompt-chart-optimized";
import type { LookbackPeriod } from "@/hooks/use-prompt-chart-data";

type ModelType = "openai" | "anthropic" | "google" | "all";

interface LazyPromptChartProps {
	lookback: LookbackPeriod;
	promptName: string;
	promptId: string;
	brandId: string;
	webSearchEnabled?: boolean;
	selectedModel?: ModelType;
	availableModels?: ("openai" | "anthropic" | "google")[];
	// Intersection observer options
	rootMargin?: string;
	threshold?: number;
}

export function LazyPromptChart({
	lookback,
	promptName,
	promptId,
	brandId,
	webSearchEnabled,
	selectedModel,
	availableModels,
	rootMargin = "100px", // Start loading when 100px away from viewport
	threshold = 0,
}: LazyPromptChartProps) {
	const [isVisible, setIsVisible] = useState(false);
	const [hasBeenVisible, setHasBeenVisible] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setIsVisible(true);
					if (!hasBeenVisible) {
						setHasBeenVisible(true);
					}
				} else {
					setIsVisible(false);
				}
			},
			{
				rootMargin,
				threshold,
			},
		);

		const currentRef = ref.current;
		if (currentRef) {
			observer.observe(currentRef);
		}

		return () => {
			if (currentRef) {
				observer.unobserve(currentRef);
			}
		};
	}, [rootMargin, threshold, hasBeenVisible]);

	return (
		<div ref={ref}>
			<PromptChartOptimized
				lookback={lookback}
				promptName={promptName}
				promptId={promptId}
				brandId={brandId}
				webSearchEnabled={webSearchEnabled}
				selectedModel={selectedModel}
				availableModels={availableModels}
				// Only enable data fetching once the component has been visible
				// Keep it enabled once loaded to maintain state when scrolling
				enabled={hasBeenVisible}
			/>
		</div>
	);
}
