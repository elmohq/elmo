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
	// Priority for intelligent loading
	priority?: "high" | "normal" | "low";
}

export function LazyPromptChart({
	lookback,
	promptName,
	promptId,
	brandId,
	webSearchEnabled,
	selectedModel,
	availableModels,
	rootMargin = "200px", // Increased margin for faster loading
	threshold = 0,
	priority = "normal",
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

	// For high priority items, load immediately
	const shouldLoad = priority === "high" || hasBeenVisible;

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
				enabled={shouldLoad}
				priority={priority}
			/>
		</div>
	);
}
