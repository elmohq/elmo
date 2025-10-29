"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { IconExternalLink } from "@tabler/icons-react";
import { ProgressBarChart, DOMAIN_CATEGORY_COLORS } from "@/components/progress-bar-chart";

export interface CitationData {
	totalCitations: number;
	uniqueDomains: number;
	brandCitations: number;
	competitorCitations: number;
	socialMediaCitations: number;
	otherCitations: number;
	domainDistribution: {
		domain: string;
		count: number;
		category: 'brand' | 'competitor' | 'social_media' | 'other';
		exampleTitle?: string;
	}[];
	specificUrls: {
		url: string;
		title?: string;
		domain: string;
		count: number;
		category: 'brand' | 'competitor' | 'social_media' | 'other';
	}[];
	citationsByPrompt?: {
		promptId: string;
		promptValue: string;
		citationCount: number;
	}[];
}

interface CitationsDisplayProps {
	citationData: CitationData;
	brandId?: string;
	brandName?: string;
	showStats?: boolean;
	showPromptBreakdown?: boolean;
	maxDomains?: number;
	maxUrls?: number;
}

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

const getCategoryColorClass = (category: string) => {
	switch (category) {
		case 'brand':
			return 'bg-green-100 text-green-800 border-green-300';
		case 'competitor':
			return 'bg-red-100 text-red-800 border-red-300';
		case 'social_media':
			return 'bg-purple-100 text-purple-800 border-purple-300';
		case 'other':
			return 'bg-gray-100 text-gray-800 border-gray-300';
		default:
			return 'bg-gray-100 text-gray-800 border-gray-300';
	}
};

export function CitationsDisplay({
	citationData,
	brandId,
	brandName,
	showStats = false,
	showPromptBreakdown = false,
	maxDomains = 15,
	maxUrls = 20,
}: CitationsDisplayProps) {
	if (citationData.totalCitations === 0) {
		return null;
	}

	const domainChartData = citationData.domainDistribution.slice(0, Math.max(maxDomains, 20));

	return (
		<>
			{/* Stats Cards */}
			{showStats && (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					<div className="md:col-span-2 lg:col-span-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
						<Card className="flex flex-col">
							<CardHeader className="gap-0">
								<CardTitle className="text-sm font-medium text-muted-foreground">Unique Domains Cited</CardTitle>
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
			)}

			{/* Citations Card */}
			<Card>
				<CardHeader>
					<CardTitle>Citations</CardTitle>
					<CardDescription>
						Sources cited by LLMs when responding to {showPromptBreakdown ? 'prompts' : 'this prompt'}. {citationData.brandCitations > 0 && brandName && (
							<>{brandName} was cited in <strong>{Math.round((citationData.brandCitations / citationData.totalCitations) * 100)}%</strong> of citations.</>
						)}
					</CardDescription>
				</CardHeader>
				<Separator />

				{/* Top Domains */}
				{domainChartData.length > 0 && (
					<>
						<CardContent className="pb-0">
							<h4 className="text-sm font-medium mb-3">Top Cited Domains (showing top {maxDomains})</h4>
							<ProgressBarChart
								items={domainChartData.slice(0, maxDomains).map((domain) => ({
									label: domain.domain,
									count: domain.count,
									category: domain.category || "other",
								}))}
								colorMapping={DOMAIN_CATEGORY_COLORS}
								percentageMode="max"
							/>
						</CardContent>
						<Separator className="mt-6" />
					</>
				)}

				{/* Specific URLs */}
				{citationData.specificUrls.length > 0 && (
					<CardContent>
						<h4 className="text-sm font-medium mb-3">Top {maxUrls} Cited URLs</h4>
						<div className="space-y-2">
							{citationData.specificUrls.slice(0, maxUrls).map((citation, idx) => (
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
				)}
			</Card>

			{/* Citations by Prompt - Only on full citations page */}
			{showPromptBreakdown && citationData.citationsByPrompt && citationData.citationsByPrompt.length > 0 && brandId && (
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
		</>
	);
}

