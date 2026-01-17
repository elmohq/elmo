"use client";

import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Button } from "@workspace/ui/components/button";
import { useCitations } from "@/hooks/use-citations";
import { useBrand } from "@/hooks/use-brands";
import { CitationsDisplay } from "@/components/citations-display";
import { getDaysFromLookback } from "@/lib/chart-utils";
import Link from "next/link";
import { PageHeader, PageHeaderSkeleton, usePageFilters, usePageFilterSetters } from "@/components/page-header";

export default function CitationsPage() {
	const params = useParams();
	const brandId = params.brand as string;

	const { selectedModel, selectedLookback, selectedTags } = usePageFilters();
	const { clearFilters } = usePageFilterSetters();
	const days = getDaysFromLookback(selectedLookback);

	// Get brand data
	const { brand } = useBrand(brandId);

	// Get citation data with tag and model filter
	const modelGroupParam = selectedModel === "all" ? undefined : selectedModel;
	const { data: citationData, isLoading, isError } = useCitations(brandId, { 
		days, 
		tags: selectedTags.length > 0 ? selectedTags : undefined,
		modelGroup: modelGroupParam,
	});

	// Get available tags from citation data
	const availableTags = citationData?.availableTags || [];

	const infoContent = (
		<p>Citations are collected from all prompt evaluations. <strong>Competitor</strong> domains shown are only those in your <Link href={`/app/${brandId}/settings`} className="underline">tracked competitors list</Link>.</p>
	);

	if (isLoading) {
		return (
			<>
				<PageHeaderSkeleton />
				<Card>
					<CardHeader>
						<Skeleton className="h-6 w-48" />
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							<Skeleton className="h-4 w-3/4" />
							<Skeleton className="h-4 w-1/2" />
							<Skeleton className="h-4 w-2/3" />
						</div>
					</CardContent>
				</Card>
			</>
		);
	}

	if (isError || !citationData) {
		return (
			<PageHeader
				title="Citations"
				subtitle="See which sources LLMs cite when responding to your prompts."
				infoContent={infoContent}
				availableTags={[]}
				editTagsLink={`/app/${brandId}/prompts/edit`}
				showModelSelector
			>
				<Card>
					<CardContent className="pt-6">
						<div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">
							Failed to load citation data. Please try again.
						</div>
					</CardContent>
				</Card>
			</PageHeader>
		);
	}

	return (
		<PageHeader
			title="Citations"
			subtitle="See which sources LLMs cite when responding to your prompts."
			infoContent={infoContent}
			availableTags={availableTags}
			editTagsLink={`/app/${brandId}/prompts/edit`}
			showModelSelector
		>
			{citationData.totalCitations === 0 ? (
				<Card>
					<CardContent className="pt-6">
						<div className="text-muted-foreground text-center py-8">
							{selectedTags.length > 0 || selectedModel !== "all" ? (
								<>
									<p className="mb-2">No citations found for the selected filters.</p>
									<p className="text-sm mb-4">Try adjusting your filters or time period.</p>
									<Button
										variant="outline"
										size="sm"
										onClick={clearFilters}
										className="cursor-pointer"
									>
										Clear filters
									</Button>
								</>
							) : (
								"No citations found. Citations are only available from prompts evaluated with web search enabled."
							)}
						</div>
					</CardContent>
				</Card>
			) : (
				<CitationsDisplay
					citationData={citationData}
					brandId={brandId}
					brandName={brand?.name}
					showStats={true}
					maxDomains={20}
					maxUrls={50}
				/>
			)}
		</PageHeader>
	);
}
