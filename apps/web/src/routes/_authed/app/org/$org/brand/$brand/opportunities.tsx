/**
 * The page renders a structured opportunities report. We assemble a deterministic
 * digest of the brand's tracked citation data (per-query standing vs the leading
 * competitor over 7d + 30d, citation difficulty, where answers are sourced, and
 * per-platform visibility) and make a single structured LLM completion (no web
 * search) to turn it into categorized opportunities. The report is cached
 * server-side and regenerated only when stale — see server/opportunities.ts.
 */

import { IconClock } from "@tabler/icons-react";
import { createFileRoute } from "@tanstack/react-router";
import { OPPORTUNITIES_GENERATIONS_PER_DAY } from "@workspace/lib/constants";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Spinner } from "@workspace/ui/components/spinner";
import { AlertCircle, RefreshCw } from "lucide-react";
import { OpportunitiesReport } from "@/components/opportunities-report";
import { PageHeader } from "@/components/page-header";
import { WriteErrorMessage } from "@/components/write-error-message";
import { useBrandId } from "@/hooks/use-brand-id";
import { useOpportunities } from "@/hooks/use-opportunities";
import { trackEvent } from "@/lib/posthog";
import { pageHead } from "@/lib/route-head";
import { useWriteErrorMessage } from "@/lib/write-errors";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/opportunities")({
	staticData: { crumb: "Opportunities" },
	head: pageHead({ description: "AI-generated opportunities to earn more AI citations." }),
	component: OpportunitiesPage,
});

function OpportunitiesPage() {
	const brandId = useBrandId();
	const { data, isLoading, error, refresh, isRefreshing, refreshError } = useOpportunities(brandId);
	const writeErrorMessage = useWriteErrorMessage();

	const infoContent = `Recommendations based on your visibility and citation metrics. Refreshed weekly, or up to ${OPPORTUNITIES_GENERATIONS_PER_DAY} times a day with Refresh.`;

	let content: React.ReactNode;
	if (isLoading || isRefreshing) {
		content = <LoadingState />;
	} else if (error) {
		content = <EmptyCard>Couldn't generate recommendations right now. Reload the page to try again.</EmptyCard>;
	} else if (!data || data.reason === "insufficient-data" || !data.report) {
		content = (
			<EmptyCard>
				We need a bit more tracking data before we can recommend opportunities — check back once your prompts have run
				for a few days.
			</EmptyCard>
		);
	} else {
		content = <OpportunitiesReport report={data.report} />;
	}

	return (
		<PageHeader
			title="Opportunities"
			subtitle="What to create, pitch, and seed to earn more AI citations — generated from your tracked answer data."
			infoContent={infoContent}
		>
			<div className="space-y-6">
				{data?.report && data.lastEvaluatedAt && (
					<div className="space-y-2">
						<div className="flex flex-wrap items-center gap-3">
							<LastEvaluatedAt date={data.lastEvaluatedAt} />
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									trackEvent("opportunities_refresh_requested");
									refresh();
								}}
								disabled={isRefreshing}
							>
								{isRefreshing ? <Spinner /> : <RefreshCw />}
								Refresh
							</Button>
						</div>
						{refreshError && !isRefreshing && (
							<p role="alert" className="flex items-start gap-2 text-sm text-red-700">
								<AlertCircle className="mt-0.5 size-4 shrink-0" />
								<span>
									<WriteErrorMessage message={writeErrorMessage(refreshError, "Couldn't refresh opportunities.")} />
								</span>
							</p>
						)}
					</div>
				)}
				{content}
			</div>
		</PageHeader>
	);
}

function LastEvaluatedAt({ date }: { date: string }) {
	return (
		<p className="flex items-center gap-1.5 text-sm text-muted-foreground">
			<IconClock className="size-4" aria-hidden />
			Last evaluated{" "}
			<time dateTime={date}>
				{new Date(date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
			</time>
		</p>
	);
}

function EmptyCard({ children }: { children: React.ReactNode }) {
	return (
		<div className="rounded-xl border border-border">
			<p className="px-6 py-10 text-center text-sm text-muted-foreground">{children}</p>
		</div>
	);
}

function LoadingState() {
	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Spinner />
				Analyzing your citation landscape and drafting your opportunities…
			</div>
			<div className="space-y-2">
				<Skeleton className="h-6 w-2/3" />
				<Skeleton className="h-4 w-full max-w-[70ch]" />
				<Skeleton className="h-4 w-1/2" />
			</div>
			<div className="space-y-3">
				{[0, 1, 2].map((i) => (
					<Skeleton key={i} className="h-28 w-full rounded-xl" />
				))}
			</div>
		</div>
	);
}
