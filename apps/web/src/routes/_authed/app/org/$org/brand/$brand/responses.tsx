import { createFileRoute } from "@tanstack/react-router";
import { cn } from "@workspace/ui/lib/utils";
import { useState } from "react";
import { BrandPromptLink } from "@/components/brand-prompt-link";
import { ALL_MODELS_VALUE, FilterBar } from "@/components/filter-bar";
import { ListPagination } from "@/components/list-pagination";
import { FilterSection, PageHeader } from "@/components/page-header";
import { ResponseCard, ResponseCardSkeletons } from "@/components/response-card";
import { SentimentFilterCard } from "@/components/sentiment-filter";
import { useBrandId } from "@/hooks/use-brand-id";
import { useBrand } from "@/hooks/use-brands";
import { useCrispChat } from "@/hooks/use-crisp-chat";
import { useListFilters } from "@/hooks/use-list-filters";
import { usePromptsSummary } from "@/hooks/use-prompts-summary";
import { useResponseSearch, useResponseSentimentCounts } from "@/hooks/use-responses";
import { useSentimentSearch, validateSentimentSearch } from "@/hooks/use-sentiment-search";
import { useSiteIcons } from "@/hooks/use-site-icons";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/responses")({
	staticData: { crumb: "Responses" },
	validateSearch: validateSentimentSearch,
	head: pageHead({ description: "Read and search every AI answer to your prompts." }),
	component: ResponsesPage,
});

function ResponsesPage() {
	const brandId = useBrandId();
	const { model, lookback, tags, promptIds, search: query } = useListFilters();

	const { data: brand } = useBrand(brandId);
	const { launcher } = useCrispChat();
	const { domainFor } = useSiteIcons(brandId);
	const trackedTargets = brand?.trackedTargets ?? [];
	const modelParam = model === ALL_MODELS_VALUE ? undefined : model;

	const { data: promptsSummary } = usePromptsSummary(brandId, { lookback, model: modelParam });
	const availableTags = promptsSummary?.availableTags ?? [];

	const { sentiment, sort, setSentiment, setSort } = useSentimentSearch();

	// A new search starts from its first page.
	const filterKey = JSON.stringify([query, lookback, modelParam, tags, promptIds, sentiment, sort]);
	const [paging, setPaging] = useState({ filterKey, page: 0 });
	const page = paging.filterKey === filterKey ? paging.page : 0;
	const setPage = (next: number) => {
		setPaging({ filterKey, page: next });
		window.scrollTo({ top: 0 });
	};

	// Placeholder data is the previous page or search, still on screen while the next one loads.
	const search = { query, lookback, model: modelParam, tags, promptIds };
	const { data, isLoading, isPlaceholderData, error } = useResponseSearch(brandId, {
		...search,
		sentiment,
		sort,
		page,
	});
	const { data: sentimentFilterCounts } = useResponseSentimentCounts(brandId, search);

	const infoContent = (
		<p>
			Every answer the AI engines gave to your prompts. Search finds responses containing the exact text you type,
			ignoring case.
		</p>
	);

	const empty = emptyMessage(data, error, sentimentFilterCounts?.all);
	let content: React.ReactNode;
	if (isLoading && !data) {
		content = <ResponseCardSkeletons count={3} />;
	} else if (empty || !data) {
		content = <EmptyState message={empty ?? ""} />;
	} else {
		content = (
			<div
				// Bottom padding keeps the pager clear of the floating support chat button.
				className={cn(
					"space-y-4 transition-opacity",
					launcher === "floating" && "pb-20",
					isPlaceholderData && "opacity-50",
				)}
				aria-busy={isPlaceholderData}
			>
				{data.matches.map((match) => (
					<ResponseCard
						key={match.id}
						run={match}
						text={match.textContent}
						highlight={data.query ?? undefined}
						prompt={
							<BrandPromptLink
								promptId={match.promptId}
								search={{ tab: "responses" }}
								className="font-medium hover:underline"
							>
								{match.promptValue || "(untitled prompt)"}
							</BrandPromptLink>
						}
						brandName={brand?.name}
						domainFor={domainFor}
					/>
				))}
				<ListPagination page={page} pageSize={data.pageSize} totalItems={data.matchedRuns} onPageChange={setPage} />
			</div>
		);
	}

	return (
		<PageHeader title="Responses" subtitle="Every AI answer to your prompts." infoContent={infoContent}>
			<FilterSection>
				<FilterBar
					availableTags={availableTags}
					promptOptions={promptsSummary?.prompts ?? []}
					trackedTargets={trackedTargets}
					showSearch
					searchPlaceholder="Search responses..."
					showModelSelector
					resultCount={data?.matchedRuns}
					resultTotal={data?.totalRuns}
					searching={isPlaceholderData}
				/>
			</FilterSection>
			<div className="space-y-4">
				{sentimentFilterCounts && sentimentFilterCounts.all > 0 && (
					<SentimentFilterCard
						counts={sentimentFilterCounts}
						value={sentiment}
						onChange={setSentiment}
						sort={sort}
						onSortChange={setSort}
					/>
				)}
				{content}
			</div>
		</PageHeader>
	);
}

function emptyMessage(
	data: { totalRuns: number; matches: unknown[]; query: string | null } | undefined,
	error: unknown,
	/** Answers the search finds before the sentiment filter; with some, it's the filter that left none. */
	searchMatches: number | undefined,
): string | null {
	if (error && !data) return "Couldn't load responses right now. Reload the page to try again.";
	if (!data || data.totalRuns === 0) {
		return "No responses for the selected filters yet. Responses appear once your prompts have been run.";
	}
	if (data.matches.length > 0) return null;
	return data.query && !searchMatches
		? `No responses contain "${data.query}" in this period.`
		: "No responses match the selected filters in this period.";
}

function EmptyState({ message }: { message: string }) {
	return <div className="py-12 text-center text-muted-foreground text-sm">{message}</div>;
}
