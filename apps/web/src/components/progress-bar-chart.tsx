import React from "react";
import { cn } from "@workspace/ui/lib/utils";

export type ProgressBarItem = {
	/** The label to display */
	label: string;
	/** The count/value to display */
	count: number;
	/** Optional category for color mapping */
	category?: string;
	/** Optional custom color (overrides category color) */
	color?: string;
	/** Optional click handler for future extensibility */
	onClick?: () => void;
	/** Optional additional metadata */
	metadata?: Record<string, any>;
};

export type ColorMapping = {
	[category: string]: string;
};

export type ProgressBarChartProps = {
	/** Array of items to display */
	items: ProgressBarItem[];
	/** Color mapping for categories */
	colorMapping?: ColorMapping;
	/** Default color if no category match */
	defaultColor?: string;
	/** Background color of the progress bar track */
	trackColor?: string;
	/** Height of the progress bar (tailwind class like 'h-2' or 'h-3') */
	barHeight?: string;
	/** How to calculate percentages: 'max' (relative to max count) or 'total' (relative to sum of all counts) */
	percentageMode?: "max" | "total";
	/** Custom total for percentage calculation (overrides percentageMode) */
	customTotal?: number;
	/** Spacing between items (tailwind class) */
	spacing?: string;
	/** Show label in bold if it matches this value */
	highlightLabel?: string;
	/** Additional CSS classes for the container */
	className?: string;
	/** Whether labels should be truncated if too long */
	truncateLabels?: boolean;
};

export function ProgressBarChart({
	items,
	colorMapping = {},
	defaultColor = "#3b82f6",
	trackColor = "bg-primary/10",
	barHeight = "h-2",
	percentageMode = "max",
	customTotal,
	spacing = "space-y-4",
	highlightLabel,
	className,
	truncateLabels = true,
}: ProgressBarChartProps) {
	// Calculate the total for percentage calculations
	const total = React.useMemo(() => {
		if (customTotal !== undefined) {
			return customTotal;
		}
		
		if (percentageMode === "total") {
			return items.reduce((sum, item) => sum + item.count, 0);
		}
		
		// percentageMode === "max"
		return Math.max(...items.map(item => item.count), 1);
	}, [items, percentageMode, customTotal]);

	const getItemColor = (item: ProgressBarItem): string => {
		// Custom color takes precedence
		if (item.color) {
			return item.color;
		}
		
		// Category-based color
		if (item.category && colorMapping[item.category]) {
			return colorMapping[item.category];
		}
		
		// Default color
		return defaultColor;
	};

	const calculatePercentage = (count: number): number => {
		if (total === 0) return 0;
		return (count / total) * 100;
	};

	return (
		<div className={cn(spacing, className)}>
			{items.map((item, idx) => {
				const percentage = calculatePercentage(item.count);
				const color = getItemColor(item);
				const isHighlighted = highlightLabel && item.label === highlightLabel;
				const isClickable = !!item.onClick;

				return (
					<div key={idx} className="space-y-2">
						<div className="flex items-center justify-between">
							<span
								className={cn(
									"text-sm flex-1",
									isHighlighted ? "font-bold" : "font-medium",
									truncateLabels && "truncate",
									isClickable && "cursor-pointer hover:underline"
								)}
								onClick={item.onClick}
							>
								{item.label}
							</span>
							<span className="text-sm ml-2 shrink-0">{item.count}</span>
						</div>
						<div className={cn("relative w-full overflow-hidden rounded-full", trackColor, barHeight)}>
							<div
								className="h-full transition-all rounded-full"
								style={{
									width: `${percentage}%`,
									backgroundColor: color,
								}}
							/>
						</div>
					</div>
				);
			})}
		</div>
	);
}

// Preset color mappings for common use cases
export const DOMAIN_CATEGORY_COLORS: ColorMapping = {
	brand: "#48bb78", // green
	competitor: "#f56565", // red
	social_media: "#7e56ee", // purple
	other: "#9ca3af", // gray
};

export const MODEL_COLORS: ColorMapping = {
	openai: "#10b981", // green
	anthropic: "#f59e0b", // amber/orange
	google: "#3b82f6", // blue
	all: "#8b5cf6", // purple
};

