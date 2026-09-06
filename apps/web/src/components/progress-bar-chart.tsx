import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import React from "react";

export type ProgressBarItem = {
	label: string;
	/** Rendered before the label — a `SiteIcon`, on the charts that name brands or domains. */
	icon?: React.ReactNode;
	count: number;
	subtitle?: string;
	suffix?: React.ReactNode;
	category?: string;
	/** Overrides the category color. */
	color?: string;
	onClick?: () => void;
	tooltip?: string;
	action?: React.ReactNode;
	metadata?: Record<string, any>;
};

type ColorMapping = {
	[category: string]: string;
};

export type ProgressBarChartProps = {
	items: ProgressBarItem[];
	colorMapping?: ColorMapping;
	defaultColor?: string;
	trackColor?: string;
	barHeight?: string;
	/** Scale bars against the largest item or the sum of all items. */
	percentageMode?: "max" | "total";
	/** Overrides the denominator selected by `percentageMode`. */
	customTotal?: number;
	spacing?: string;
	highlightLabel?: string;
	className?: string;
	truncateLabels?: boolean;
	fillHeight?: boolean;
};

function ItemLabel({
	className,
	bold,
	onClick,
	children,
	...props
}: React.ComponentProps<"button"> & { bold?: boolean }) {
	const classes = cn("text-sm text-left", bold ? "font-bold" : "font-medium", className);
	if (!onClick) {
		return (
			<span className={classes} {...props}>
				{children}
			</span>
		);
	}
	return (
		<button type="button" className={cn(classes, "cursor-pointer hover:underline")} onClick={onClick} {...props}>
			{children}
		</button>
	);
}

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
	fillHeight = false,
}: ProgressBarChartProps) {
	const total = React.useMemo(() => {
		if (customTotal !== undefined) {
			return customTotal;
		}

		if (percentageMode === "total") {
			return items.reduce((sum, item) => sum + item.count, 0);
		}

		return Math.max(...items.map((item) => item.count), 1);
	}, [items, percentageMode, customTotal]);

	const getItemColor = (item: ProgressBarItem): string => {
		if (item.color) {
			return item.color;
		}

		if (item.category && colorMapping[item.category]) {
			return colorMapping[item.category];
		}

		return defaultColor;
	};

	const calculatePercentage = (count: number): number => {
		if (total === 0) return 0;
		return (count / total) * 100;
	};

	return (
		<div className={cn(fillHeight ? "flex flex-col justify-between h-full" : spacing, className)}>
			{items.map((item) => {
				const percentage = calculatePercentage(item.count);
				const color = getItemColor(item);
				const isHighlighted = highlightLabel && item.label === highlightLabel;
				const isClickable = !!item.onClick;

				return (
					<div key={item.label} className="space-y-2">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-1.5 min-w-0 flex-1">
								{item.icon}
								{item.tooltip ? (
									<Tooltip>
										<TooltipTrigger
											render={
												<ItemLabel
													className={cn("cursor-default", truncateLabels && "truncate")}
													bold={Boolean(isHighlighted)}
													onClick={item.onClick}
												/>
											}
										>
											{item.label}
										</TooltipTrigger>
										<TooltipContent className="max-w-xs text-xs font-normal">{item.tooltip}</TooltipContent>
									</Tooltip>
								) : (
									<ItemLabel
										className={cn(truncateLabels && "truncate")}
										bold={Boolean(isHighlighted)}
										onClick={item.onClick}
									>
										{item.label}
									</ItemLabel>
								)}
								{item.action}
							</div>
							<div className="flex items-center gap-2 ml-2 shrink-0">
								<span className="text-sm">{item.count.toLocaleString()}</span>
								{item.suffix}
							</div>
						</div>
						{item.subtitle && <p className="text-xs text-muted-foreground truncate -mt-1">{item.subtitle}</p>}
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

export { DOMAIN_CATEGORY_COLORS } from "@/lib/domain-categories";
