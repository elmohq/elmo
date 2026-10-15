import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { useMemo, useState } from "react";
import { BrandPromptLink } from "@/components/brand-prompt-link";
import { ALL_MODELS_VALUE, FilterBar } from "@/components/filter-bar";
import { ListPagination } from "@/components/list-pagination";
import { FilterSection, PageHeader } from "@/components/page-header";
import { PromptsFilterDropdown } from "@/components/prompts-filter-dropdown";
import { ResponseCard, ResponseCardSkeletons } from "@/components/response-card";
import { useBrandId } from "@/hooks/use-brand-id";
import { useBrand } from "@/hooks/use-brands";
import { useCrispChat } from "@/hooks/use-crisp-chat";
import { joinTags, splitTags, useListFilters } from "@/hooks/use-list-filters";
import { usePromptsSummary } from "@/hooks/use-prompts-summary";
import { useResponseSearch } from "@/hooks/use-responses";
import { useSiteIcons } from "@/hooks/use-site-icons";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/responses")({
	staticData: { crumb: "Responses" },
	// Comma-joined IDs, like `tags`, so a filtered view stays linkable.
	validateSearch: (search: Record<string, unknown>): { prompts?: string; uncertain?: boolean } => ({
		prompts: typeof search.prompts === "string" && search.prompts ? search.prompts : undefined,
		uncertain: search.uncertain === true || search.uncertain === "true" ? true : undefined,
	}),
	head: pageHead({ description: "Read and search every AI answer to your prompts." }),
	component: ResponsesPage,
});

function ResponsesPage() {
	const brandId = useBrandId();
	const { model, lookback, tags, search: query } = useListFilters();

	const { data: brand } = useBrand(brandId);
	const { launcher } = useCrispChat();
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

	const [uncertainOnly, setUncertainOnly] = useUncertainFilter();

	// A new search starts from its first page.
	const filterKey = JSON.stringify([query, lookback, modelParam, tags, promptIds, uncertainOnly]);
	const [paging, setPaging] = useState({ filterKey, page: 0 });
	const page = paging.filterKey === filterKey ? paging.page : 0;
	const setPage = (next: number) => {
		setPaging({ filterKey, page: next });
		window.scrollTo({ top: 0 });
	};

	// Placeholder data is the previous page or search, still on screen while the next one loads.
	const { data, isLoading, isPlaceholderData, error } = useResponseSearch(brandId, {
		query,
		lookback,
		model: modelParam,
		tags,
		promptIds,
		uncertainOnly,
		page,
	});

	const infoContent = (
		<p>
			Every answer the AI engines gave to your prompts. Search finds responses containing the exact text you type,
			ignoring case. "Needs review" shows the answers where Elmo couldn't tell whether your brand or a competitor was
			really meant. They still count as mentions.
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
		content = <EmptyState message={noMatchesMessage(data.query)} />;
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
					trackedTargets={trackedTargets}
					showSearch
					searchPlaceholder="Search responses..."
					showModelSelector
					extraControls={
						<>
							<PromptsFilterDropdown
								prompts={promptsSummary?.prompts ?? []}
								selected={promptIds}
								onChange={setPromptIds}
							/>
							<NeedsReviewToggle pressed={uncertainOnly} onChange={setUncertainOnly} />
						</>
					}
					resultCount={data?.matchedRuns}
					resultTotal={data?.totalRuns}
					searching={isPlaceholderData}
				/>
			</FilterSection>
			{content}
		</PageHeader>
	);
}

function NeedsReviewToggle({ pressed, onChange }: { pressed: boolean; onChange: (next: boolean) => void }) {
	return (
		<Button
			variant={pressed ? "secondary" : "outline"}
			size="sm"
			className="h-8"
			aria-pressed={pressed}
			onClick={() => onChange(!pressed)}
		>
			Needs review
		</Button>
	);
}

function useUncertainFilter(): [boolean, (next: boolean) => void] {
	const uncertainOnly = Route.useSearch({ select: (s) => s.uncertain ?? false });
	const navigate = Route.useNavigate();
	const setUncertainOnly = (next: boolean) =>
		navigate({
			search: (prev) => ({ ...prev, uncertain: next || undefined }),
			replace: true,
			resetScroll: false,
		});
	return [uncertainOnly, setUncertainOnly];
}

const noMatchesMessage = (query: string | null) =>
	query ? `No responses contain "${query}" in this period.` : "No responses need review in this period.";

function EmptyState({ message }: { message: string }) {
	return <div className="py-12 text-center text-muted-foreground text-sm">{message}</div>;
}
