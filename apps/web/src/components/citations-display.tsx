"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Separator } from "@workspace/ui/components/separator";
import { IconExternalLink, IconInfoCircle } from "@tabler/icons-react";
import { ProgressBarChart, DOMAIN_CATEGORY_COLORS } from "@/components/progress-bar-chart";
import { Tooltip, TooltipTrigger, TooltipContent } from "@workspace/ui/components/tooltip";
import Link from "next/link";

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
}

interface CitationsDisplayProps {
	citationData: CitationData;
	brandId?: string;
	brandName?: string;
	showStats?: boolean;
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
			return 'bg-green-500 text-white';
		case 'competitor':
			return 'bg-red-500 text-white';
		case 'social_media':
			return 'bg-purple-500 text-white';
		case 'other':
			return 'bg-gray-500 text-white';
		default:
			return 'bg-gray-500 text-white';
	}
};

const formatUrlForDisplay = (url: string, domain: string) => {
	// Remove protocol
	let displayUrl = url.replace(/^https?:\/\//, '');
	
	// Remove leading www.
	displayUrl = displayUrl.replace(/^www\./, '');
	
	// Truncate if too long (max 80 characters)
	const maxLength = 80;
	if (displayUrl.length > maxLength) {
		displayUrl = displayUrl.substring(0, maxLength) + '...';
	}
	
	return displayUrl;
};

const extractFilenameFromUrl = (url: string) => {
	try {
		const urlObj = new URL(url);
		// Get pathname without search params
		const pathname = urlObj.pathname;
		
		// Get the last segment of the path
		const segments = pathname.split('/').filter(Boolean);
		
		if (segments.length === 0) {
			// If no path segments, return the domain
			return urlObj.hostname.replace(/^www\./, '');
		}
		
		// Return the last segment (filename)
		return segments[segments.length - 1];
	} catch {
		// If URL parsing fails, fall back to the original URL
		return url;
	}
};

export function CitationsDisplay({
	citationData,
	brandId,
	brandName,
	showStats = false,
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
								<div className="text-3xl md:text-4xl lg:text-5xl font-bold">{citationData.uniqueDomains.toLocaleString()}</div>
							</CardContent>
						</Card>
						<Card className="flex flex-col">
							<CardHeader className="gap-0">
								<CardTitle className="text-sm font-medium text-muted-foreground">Total Citations</CardTitle>
							</CardHeader>
							<CardContent className="flex-1 flex items-center">
								<div className="text-3xl md:text-4xl lg:text-5xl font-bold">{citationData.totalCitations.toLocaleString()}</div>
							</CardContent>
						</Card>
					</div>

					<Card className="md:col-span-2 lg:col-span-3">
						<CardHeader className="gap-0">
							<CardTitle className="flex items-center gap-1.5">
								Citations by Domain Type
								<Tooltip>
									<TooltipTrigger asChild>
										<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
									</TooltipTrigger>
									<TooltipContent className="max-w-xs text-sm font-normal">
										<p className="mb-2"><strong>Competitor</strong> domains are only those you&apos;ve added to your <Link href={brandId ? `/app/${brandId}/settings` : "#"} className="underline">competitors list</Link>.</p>
										<p>If you see a competitor in &quot;Other&quot;, consider adding them to your list for better tracking.</p>
									</TooltipContent>
								</Tooltip>
							</CardTitle>
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
					<CardTitle className="flex items-center gap-1.5">
						Citations
						<Tooltip>
							<TooltipTrigger asChild>
								<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
							</TooltipTrigger>
							<TooltipContent className="max-w-xs text-sm font-normal">
								<p className="mb-2">Citations are collected from all prompt evaluations in your selected time period, regardless of whether your brand appears in the response.</p>
								<p><strong>Competitor</strong> domains shown are only those in your <Link href={brandId ? `/app/${brandId}/settings` : "#"} className="underline">tracked competitors list</Link>.</p>
							</TooltipContent>
						</Tooltip>
					</CardTitle>
					<CardDescription>
						Sources cited by LLMs when responding to your prompts. {citationData.brandCitations > 0 && brandName && (
							<>{brandName} was cited in <strong>{Math.round((citationData.brandCitations / citationData.totalCitations) * 100)}%</strong> of citations.</>
						)}
					</CardDescription>
				</CardHeader>
				<Separator />

				{/* Top Domains */}
				{domainChartData.length > 0 && (
					<>
						<CardContent className="pb-0">
							<h4 className="text-sm font-medium mb-1">Top Cited Domains (showing top {maxDomains})</h4>
							<p className="text-xs text-muted-foreground mb-3">Counts show how many times each domain was cited across all prompt runs</p>
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
						<h4 className="text-sm font-medium mb-1">Top {maxUrls} Cited URLs</h4>
						<p className="text-xs text-muted-foreground mb-3">Counts show how many times each URL was cited across all prompt runs</p>
						<div className="space-y-2">
							{citationData.specificUrls.slice(0, maxUrls).map((citation, idx) => {
								const displayUrl = formatUrlForDisplay(citation.url, citation.domain);
								const domainEndIndex = displayUrl.indexOf('/');
								const domainPart = domainEndIndex > 0 ? displayUrl.substring(0, domainEndIndex) : displayUrl;
								const pathPart = domainEndIndex > 0 ? displayUrl.substring(domainEndIndex) : '';
								
								return (
									<a
										key={idx}
										href={citation.url}
										target="_blank"
										rel="noopener noreferrer"
										className="block relative p-3 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors group"
									>
										{/* First row: Category badge, title, and count */}
										<div className="flex items-start justify-between gap-3 mb-2">
											<div className="flex items-center gap-2 min-w-0 flex-1">
												<Badge className={getCategoryColorClass(citation.category)}>
													{getCategoryLabel(citation.category)}
												</Badge>
												<span className="text-sm font-medium truncate">
													{citation.title || extractFilenameFromUrl(citation.url)}
												</span>
											</div>
											<span className="text-sm font-semibold text-gray-700 shrink-0">
												{citation.count.toLocaleString()}
											</span>
										</div>
										
										{/* Second row: URL with bolded domain */}
										<div className="text-xs text-muted-foreground truncate pr-6">
											<span className="font-bold">{domainPart}</span>
											{pathPart && <span>{pathPart}</span>}
										</div>
										
										{/* External link icon in bottom right */}
										<IconExternalLink className="h-3.5 w-3.5 absolute bottom-3 right-3 text-gray-400 group-hover:text-gray-600 transition-colors" />
									</a>
								);
							})}
						</div>
					</CardContent>
				)}
			</Card>
		</>
	);
}

