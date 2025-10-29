"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useCitations } from "@/hooks/use-citations";
import { useBrand } from "@/hooks/use-brands";
import { IconExternalLink } from "@tabler/icons-react";
import { ProgressBarChart, DOMAIN_CATEGORY_COLORS } from "@/components/progress-bar-chart";

export default function CitationsPage() {
	const params = useParams();
	const brandId = params.brand as string;
	const [daysFilter, setDaysFilter] = useState(7);

	// Get brand data
	const { brand } = useBrand(brandId);

	// Get citation data
	const { data: citationData, isLoading, isError } = useCitations(brandId, { days: daysFilter });

	// Category color mapping (for badge display in URLs section)
	const getCategoryColor = (category: string) => {
		switch (category) {
			case 'brand':
				return '#10b981'; // green
			case 'competitor':
				return '#ef4444'; // red
			case 'social_media':
				return '#8b5cf6'; // purple
			case 'other':
				return '#6b7280'; // gray
			default:
				return '#3b82f6'; // blue
		}
	};

	const getCategoryLabel = (category: string) => {
		switch (category) {
			case 'brand':
				return 'Brand';
			case 'competitor':
				return 'Competitor';
			case 'social_media':
				return 'Social Media';
			case 'other':
				return 'Other';
			default:
				return category;
		}
	};

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div>
					<Skeleton className="h-10 w-96 mb-2" />
					<Skeleton className="h-6 w-64" />
				</div>
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
			</div>
		);
	}

	if (isError || !citationData) {
		return (
			<div className="space-y-6">
				<h1 className="text-3xl font-bold">Citations</h1>
				<Card>
					<CardContent className="pt-6">
						<div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">
							Failed to load citation data. Please try again.
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	// Prepare data for domain distribution chart
	const domainChartData = citationData.domainDistribution.slice(0, 20).map(d => ({
		name: d.domain,
		count: d.count,
		category: d.category,
	}));

	return (
		<div className="space-y-6">
			<div className="flex justify-between items-start">
				<div>
					<h1 className="text-3xl font-bold">Citations</h1>
					<p className="text-muted-foreground mt-1">
						See which sources LLMs cite when responding to prompts about {brand?.name || "your brand"}.
					</p>
				</div>
				
				{/* Days Filter */}
				<div className="flex gap-2">
					{[7, 14, 30].map((days) => (
						<Button
							key={days}
							variant={daysFilter === days ? "default" : "outline"}
							size="sm"
							onClick={() => setDaysFilter(days)}
							className="cursor-pointer"
						>
							{days}d
						</Button>
					))}
				</div>
			</div>

			{/* Option 1: Grid Layout with Progress Bars */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				{/* Left Column - Stats Cards (wrapped for lg layout) */}
				<div className="md:col-span-2 lg:col-span-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
					<Card className="flex flex-col">
						<CardHeader className="gap-0">
							<CardTitle className="text-sm font-medium text-muted-foreground">Unique Domains</CardTitle>
						</CardHeader>
						<CardContent className="flex-1 flex items-center">
							<div className="text-3xl md:text-4xl lg:text-5xl font-bold">{citationData.uniqueDomains}</div>
						</CardContent>
					</Card>
					<Card className="flex flex-col">
						<CardHeader className="gap-0">
							<CardTitle className="text-sm font-medium text-muted-foreground">Total Citations</CardTitle>
						</CardHeader>
						<CardContent className="flex-1 flex items-center">
							<div className="text-3xl md:text-4xl lg:text-5xl font-bold">{citationData.totalCitations}</div>
						</CardContent>
					</Card>
				</div>

				{/* Right Section - Category Breakdown */}
				<Card className="md:col-span-2 lg:col-span-3">
					<CardHeader className="gap-0">
						<CardTitle>Citations by Domain Type</CardTitle>
					</CardHeader>
					<Separator />
					<CardContent className="space-y-6">
						<ProgressBarChart
							items={[
								{ label: "Brand", count: citationData.brandCitations, category: "brand" },
								{ label: "Competitor", count: citationData.competitorCitations, category: "competitor" },
								{ label: "Social Media", count: citationData.socialMediaCitations, category: "social_media" },
								{ label: "Other", count: citationData.otherCitations, category: "other" },
							]}
							colorMapping={DOMAIN_CATEGORY_COLORS}
							percentageMode="total"
						/>
					</CardContent>
				</Card>
			</div>

			{/* Top Domains */}
			{domainChartData.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Top Cited Domains</CardTitle>
						<CardDescription>
							Most frequently cited domains (showing top 20)
						</CardDescription>
					</CardHeader>
					<Separator />
					<CardContent className="space-y-4">
						<ProgressBarChart
							items={domainChartData.map((domain) => ({
								label: domain.name,
								count: domain.count,
								category: domain.category || "other",
							}))}
							colorMapping={DOMAIN_CATEGORY_COLORS}
							percentageMode="max"
						/>
					</CardContent>
				</Card>
			)}

			{/* Citations by Prompt */}
			{citationData.citationsByPrompt.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Citations by Prompt</CardTitle>
						<CardDescription>
							Which prompts generate the most citations
						</CardDescription>
					</CardHeader>
					<Separator />
					<CardContent>
						<div className="space-y-3">
							{citationData.citationsByPrompt.slice(0, 10).map((item) => (
								<div key={item.promptId} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
									<div className="flex-1">
										<a 
											href={`/app/${brandId}/prompts/${item.promptId}`}
											className="text-sm font-medium hover:underline"
										>
											{item.promptValue}
										</a>
									</div>
									<Badge variant="outline" className="ml-4">
										{item.citationCount} {item.citationCount === 1 ? 'citation' : 'citations'}
									</Badge>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Specific URLs */}
			{citationData.specificUrls.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>All Cited URLs</CardTitle>
						<CardDescription>
							Every specific page referenced across all prompt evaluations (showing top 50)
						</CardDescription>
					</CardHeader>
					<Separator />
					<CardContent>
						<div className="space-y-2">
							{citationData.specificUrls.slice(0, 50).map((citation, idx) => (
								<div 
									key={idx} 
									className="flex items-start justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
								>
									<div className="flex-1 min-w-0 mr-4">
										<div className="flex items-center gap-2 mb-1">
											<Badge 
												variant={citation.category === 'brand' ? 'default' : 'outline'}
												style={{
													backgroundColor: citation.category === 'brand' ? getCategoryColor('brand') : undefined,
													borderColor: getCategoryColor(citation.category),
													color: citation.category === 'brand' ? 'white' : getCategoryColor(citation.category),
												}}
											>
												{getCategoryLabel(citation.category)}
											</Badge>
											<span className="text-xs text-muted-foreground">{citation.domain}</span>
										</div>
										<a 
											href={citation.url}
											target="_blank"
											rel="noopener noreferrer"
											className="text-sm hover:underline flex items-center gap-1 text-blue-600"
										>
											{citation.title || citation.url}
											<IconExternalLink className="h-3 w-3" />
										</a>
									</div>
									<Badge variant="secondary" className="shrink-0">
										{citation.count}
									</Badge>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{citationData.totalCitations === 0 && (
				<Card>
					<CardContent className="pt-6">
						<div className="text-muted-foreground text-center py-8">
							No citations found in the past {daysFilter} days. Citations are only available from prompts evaluated with web search enabled.
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

