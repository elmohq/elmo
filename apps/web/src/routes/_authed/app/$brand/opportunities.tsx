/**
 * /app/$brand/opportunities — AI-generated opportunities.
 *
 * The page renders a structured opportunities report. We assemble a deterministic
 * digest of the brand's tracked citation data (per-query standing vs the leading
 * competitor over 7d + 30d, citation difficulty, where answers are sourced, and
 * per-platform visibility) and make a single structured LLM completion (no web
 * search) to turn it into categorized opportunities. The report is cached
 * server-side and regenerated only when stale — see server/opportunities.ts.
 */

import { IconClock, IconLoader2 } from "@tabler/icons-react";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { OpportunitiesReport } from "@/components/opportunities-report";
import { PageHeader } from "@/components/page-header";
import { useOpportunities } from "@/hooks/use-opportunities";
import { buildTitle, getAppName, getBrandName } from "@/lib/route-head";
import { formatDate } from "@/i18n/formatting";
import * as m from "@/paraglide/messages.js";

export const Route = createFileRoute("/_authed/app/$brand/opportunities")({
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle(m.page_opportunities_title(), { appName, brandName }) },
				{ name: "description", content: m.page_opportunities_meta_description() },
			],
		};
	},
	component: OpportunitiesPage,
});

function OpportunitiesPage() {
	const { brand: brandId } = Route.useParams();
	const { data, isLoading, isError } = useOpportunities(brandId);

	const infoContent = m.page_opportunities_info();

	let content: React.ReactNode;
	if (isLoading) {
		content = <LoadingState />;
	} else if (isError) {
		content = <EmptyCard>{m.opportunities_error()}</EmptyCard>;
	} else if (!data || data.reason === "insufficient-data" || !data.report) {
		content = (
			<EmptyCard>{m.opportunities_insufficient()}</EmptyCard>
		);
	} else {
		content = <OpportunitiesReport report={data.report} brandId={brandId} />;
	}

	return (
		<PageHeader
			title={m.page_opportunities_title()}
			subtitle={m.page_opportunities_description()}
			infoContent={infoContent}
		>
			<div className="space-y-6">
				{data?.report && data.lastEvaluatedAt && <LastEvaluatedAt date={data.lastEvaluatedAt} />}
				{content}
			</div>
		</PageHeader>
	);
}

function LastEvaluatedAt({ date }: { date: string }) {
	return (
		<p className="flex items-center gap-1.5 text-sm text-muted-foreground">
			<IconClock className="size-4" aria-hidden />
			<time dateTime={date}>
				{m.opportunities_last_evaluated({
					date: formatDate(date, { month: "long", day: "numeric", year: "numeric" }),
				})}
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
				<IconLoader2 className="size-4 animate-spin" />
				{m.opportunities_analyzing()}
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
