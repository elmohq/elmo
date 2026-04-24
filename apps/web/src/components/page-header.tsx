import { ReactNode, useEffect, useRef, useState } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@workspace/ui/components/tooltip";
import { IconInfoCircle } from "@tabler/icons-react";
import { Skeleton } from "@workspace/ui/components/skeleton";

// Re-exports for callers that still import filter primitives from the old
// location. The canonical source is now `@/components/filter-bar`.
export {
	FilterBar,
	ModelDropdown,
	TagsDropdown,
	LookbackDropdown,
	SearchInput,
	ResultCount,
	usePageFilters,
	usePageFilterSetters,
	getAvailableModelsForBrand,
	type ModelType,
} from "@/components/filter-bar";

interface PageHeaderProps {
	title: string;
	subtitle: string;
	infoContent?: ReactNode;
	children?: ReactNode;
}

/** Title + subtitle block. No filter state, no data fetching — callers
 *  compose the sticky filter section and content as children. */
export function PageHeader({ title, subtitle, infoContent, children }: PageHeaderProps) {
	return (
		<div className="space-y-0">
			<div className="mb-4">
				<h1 className="text-3xl font-bold flex items-center gap-2">
					{title}
					{infoContent && (
						<Tooltip>
							<TooltipTrigger asChild>
								<IconInfoCircle className="h-5 w-5 text-muted-foreground cursor-help" />
							</TooltipTrigger>
							<TooltipContent className="max-w-xs text-sm font-normal">
								{infoContent}
							</TooltipContent>
						</Tooltip>
					)}
				</h1>
				<p className="text-muted-foreground mt-1">{subtitle}</p>
			</div>
			{children}
		</div>
	);
}

export function PageHeaderTitleSkeleton() {
	return (
		<div className="mb-4 space-y-2">
			<Skeleton className="h-9 w-48" />
			<Skeleton className="h-5 w-80" />
		</div>
	);
}

/** Sticky wrapper for the filter bar + visibility bar. Uses an
 *  IntersectionObserver sentinel to draw a shadow once the bar is
 *  scrolled past the page header. */
export function StickyFilterSection({ children }: { children: ReactNode }) {
	const [isStuck, setIsStuck] = useState(false);
	const sentinelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			([entry]) => setIsStuck(!entry.isIntersecting),
			{ threshold: 0 },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, []);

	const stuckShadow =
		"shadow-[0_4px_6px_0px_rgba(255,255,255,1),0_10px_15px_-3px_rgba(255,255,255,1),0_20px_25px_-5px_rgba(255,255,255,0.9)] dark:shadow-[0_4px_6px_0px_rgba(9,9,11,1),0_10px_15px_-3px_rgba(9,9,11,1),0_20px_25px_-5px_rgba(9,9,11,0.9)]";

	return (
		<>
			<div ref={sentinelRef} className="h-0" />
			<div className={`sticky top-[var(--header-height)] z-10 pt-2 pb-4 bg-white dark:bg-zinc-950 ${isStuck ? stuckShadow : ""}`}>
				{children}
			</div>
		</>
	);
}
