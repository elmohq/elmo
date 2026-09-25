/** Every answer the AI engines gave to this brand's prompts, searchable by its text. */
import { createFileRoute } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { useMemo, useState } from "react";
import { BrandPromptLink } from "@/components/brand-prompt-link";
import { ALL_MODELS_VALUE, FilterBar } from "@/components/filter-bar";
import { ListPagination } from "@/components/list-pagination";
import { FilterSection, PageHeader } from "@/components/page-header";
import { PromptsFilterDropdown } from "@/components/prompts-filter-dropdown";
import { ResponseCard, ResponseCardSkeletons } from "@/components/response-card";
import { useBrandId } from "@/hooks/use-brand-id";
import { useBrand } from "@/hooks/use-brands";
import { joinTags, splitTags, useListFilters } from "@/hooks/use-list-filters";
import { usePromptsSummary } from "@/hooks/use-prompts-summary";
import { useResponseSearch } from "@/hooks/use-responses";
import { useSiteIcons } from "@/hooks/use-site-icons";
import { RESPONSES_PAGE_SIZE } from "@/lib/responses";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/responses")({
	staticData: { crumb: "Responses" },
	// Comma-joined IDs, like `tags`, so a filtered view stays linkable.
	validateSearch: (search: Record<string, unknown>): { prompts?: string } => ({
		prompts: typeof search.prompts === "string" && search.prompts ? search.prompts : undefined,
	}),
	head: pageHead({ description: "Read and search every AI answer to your prompts." }),
	component: ResponsesPage,
});

function ResponsesPage() {
	const brandId = useBrandId();
	const { model, lookback, tags, search } = useListFilters();
	const query = search.trim();

	const { data: brand } = useBrand(brandId);
	const { domainFor } = useSiteIcons(brandId);
	const trackedTargets = brand?.trackedTargets ?? [];
	const modelParam = model === ALL_MODELS_VALUE ? undefined : model;

	const { data: promptsSummary } = usePromptsSummary(brandId, { lookback, model: modelParam });
	const availableTags = promptsSummary?.availableTags ?? [];

	const promptsParam = Route.useSearch({ select: (s) => s.prompts });
	const promptIds = useMemo(() => splitTags(promptsParam), [promptsParam]);
	const navigate = Route.useNavigate();
	const setPromptIds = (next: string[]) =>
		navigate({
			search: (prev) => ({ ...prev, prompts: joinTags(next) }),
			replace: true,
			resetScroll: false,
		});

	// A new search starts from its first page.
	const filterKey = JSON.stringify([query, lookback, modelParam, tags, promptIds]);
	const [paging, setPaging] = useState({ filterKey, page: 0 });
	const page = paging.filterKey === filterKey ? paging.page : 0;
	const setPage = (next: number) => setPaging({ filterKey, page: next });

	const { data, isLoading, error } = useResponseSearch(brandId, {
		query,
		lookback,
		model: modelParam,
		tags,
		promptIds,
		page,
	});

	const infoContent = (
		<p>
			Every answer the AI engines gave to your prompts. Search matches any form of a word; put a phrase in "quotes" to
			match it exactly, use <em>or</em> to match either term, and a leading minus to exclude a word.
		</p>
	);

	let content: React.ReactNode;
	if (isLoading && !data) {
		content = <ResponseCardSkeletons count={3} />;
	} else if (error && !data) {
		content = <EmptyState message="Couldn't load responses right now. Reload the page to try again." />;
	} else if (!data || data.totalRuns === 0) {
		content = (
			<EmptyState message="No responses for the selected filters yet. Responses appear once your prompts have been run." />
		);
	} else if (data.matches.length === 0) {
		content = <EmptyState message={`No responses contain "${data.query}" in this period.`} />;
	} else {
		content = (
			<div className="space-y-4">
				{data.matches.map((match) => (
					<ResponseCard
						key={match.id}
						run={match}
						text={match.text}
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
				<ListPagination
					page={page}
					pageSize={RESPONSES_PAGE_SIZE}
					totalItems={data.matchedRuns}
					onPageChange={setPage}
				/>
			</div>
		);
	}

	return (
		<PageHeader title="Responses" subtitle="Every AI answer to your prompts." infoContent={infoContent}>
			<FilterSection>
				<FilterBar
					availableTags={availableTags}
					trackedTargets={trackedTargets}
					showSearch
					searchPlaceholder="Search responses..."
					showModelSelector
					extraControls={
						<PromptsFilterDropdown
							prompts={promptsSummary?.prompts ?? []}
							selected={promptIds}
							onChange={setPromptIds}
						/>
					}
					resultCount={data?.matchedRuns}
					resultTotal={data?.totalRuns}
				/>
			</FilterSection>
			{data?.indexing && (
				<Alert className="mb-4">
					<AlertDescription>
						Older responses are still being indexed for search, so some matches may be missing for now.
					</AlertDescription>
				</Alert>
			)}
			{content}
		</PageHeader>
	);
}

function EmptyState({ message }: { message: string }) {
	return <div className="py-12 text-center text-muted-foreground text-sm">{message}</div>;
}
