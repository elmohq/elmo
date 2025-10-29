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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Label } from "recharts";
import { IconExternalLink } from "@tabler/icons-react";
import { ChartConfig, ChartContainer, ChartLegend, ChartLegendContent } from "@/components/ui/chart";

// Custom tick component for domain names
const CustomTick = (props: any) => {
	const { x, y, payload } = props;
	return (
		<g transform={`translate(${x},${y})`}>
			<text x={-5} y={0} dy={4} textAnchor="end" fill="#666" fontSize="12" style={{ maxWidth: "220px" }}>
				{payload.value}
			</text>
		</g>
	);
};

// Reusable Horizontal Bar Chart Component
interface HorizontalBarChartProps {
	data: { name: string; count: number; category?: string }[];
	tooltipLabel: string;
	maxValue?: number;
	getCategoryColor?: (category: string) => string;
}

const HorizontalBarChart = ({
	data,
	tooltipLabel,
	maxValue,
	getCategoryColor,
}: HorizontalBarChartProps) => {
	// Helper function to get max count safely
	const getMaxCount = (chartData: { count: number }[]) => {
		if (!chartData || chartData.length === 0) return 1;
		const validCounts = chartData
			.map((d) => d.count)
			.filter((count) => typeof count === "number" && !isNaN(count) && count >= 0);
		if (validCounts.length === 0) return 1;
		const max = Math.max(...validCounts);
		return isNaN(max) ? 1 : Math.max(max, 1);
	};

	// Helper function to validate chart data
	const isValidChartData = (chartData: { name: string; count: number }[]) => {
		if (!chartData || !Array.isArray(chartData) || chartData.length === 0) return false;
		return chartData.every(
			(item) =>
				item &&
				typeof item.name === "string" &&
				typeof item.count === "number" &&
				!isNaN(item.count) &&
				item.count >= 0,
		);
	};

	// Calculate dynamic heights based on number of categories (40px per bar + padding)
	const calculateChartHeight = (itemCount: number, minHeight = 200, maxHeight = 800) => {
		const calculatedHeight = Math.max(minHeight, Math.min(maxHeight, itemCount * 40 + 80));
		return calculatedHeight;
	};

	if (!isValidChartData(data)) {
		return <div className="text-muted-foreground text-center py-8">No data available</div>;
	}

	return (
		<div style={{ height: calculateChartHeight(data.length) }}>
			<ResponsiveContainer width="100%" height="100%">
				<BarChart data={data} layout="vertical" margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
					<CartesianGrid strokeDasharray="3 3" />
					<XAxis
						type="number"
						domain={[0, maxValue || getMaxCount(data)]}
						tickCount={Math.min(10, (maxValue || getMaxCount(data)) + 1)}
						allowDecimals={false}
					/>
					<YAxis dataKey="name" type="category" width={240} tick={<CustomTick />} interval={0} />
					<Tooltip formatter={(value) => [value, tooltipLabel]} />
					<Bar dataKey="count" barSize={8}>
						{data.map((entry, index) => (
							<Cell 
								key={`cell-${index}`} 
								fill={getCategoryColor && entry.category ? getCategoryColor(entry.category) : '#3b82f6'} 
							/>
						))}
					</Bar>
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
};

export default function CitationsPage() {
	const params = useParams();
	const brandId = params.brand as string;
	const [daysFilter, setDaysFilter] = useState(7);

	// Get brand data
	const { brand } = useBrand(brandId);

	// Get citation data
	const { data: citationData, isLoading, isError } = useCitations(brandId, { days: daysFilter });

	// Category color mapping
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

	// Prepare pie chart data for category distribution
	const categoryChartData = [
		{ category: "brand", name: "Brand", count: citationData.brandCitations, fill: "#48bb78" },
		{ category: "competitor", name: "Competitor", count: citationData.competitorCitations, fill: "#f56565" },
		{ category: "social_media", name: "Social Media", count: citationData.socialMediaCitations, fill: "#7e56ee" },
		{ category: "other", name: "Other", count: citationData.otherCitations, fill: "#9ca3af" },
	].filter(item => item.count > 0); // Only show categories with data

	const categoryChartConfig = {
		count: {
			label: "Citations",
		},
		brand: {
			label: "Brand",
			color: "#48bb78",
		},
		competitor: {
			label: "Competitor",
			color: "#f56565",
		},
		social_media: {
			label: "Social Media",
			color: "#7e56ee",
		},
		other: {
			label: "Other",
			color: "#9ca3af",
		},
	} satisfies ChartConfig;

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
						{/* Brand */}
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium">Brand</span>
								<span className="text-sm">{citationData.brandCitations}</span>
							</div>
							<div className="relative h-3 w-full overflow-hidden rounded-full bg-primary/20">
								<div 
									className="h-full transition-all rounded-full"
									style={{ 
										width: `${citationData.totalCitations > 0 ? (citationData.brandCitations / citationData.totalCitations) * 100 : 0}%`,
										backgroundColor: '#48bb78'
									}}
								/>
							</div>
						</div>

						{/* Competitor */}
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium">Competitor</span>
								<span className="text-sm">{citationData.competitorCitations}</span>
							</div>
							<div className="relative h-3 w-full overflow-hidden rounded-full bg-primary/20">
								<div 
									className="h-full transition-all rounded-full"
									style={{ 
										width: `${citationData.totalCitations > 0 ? (citationData.competitorCitations / citationData.totalCitations) * 100 : 0}%`,
										backgroundColor: '#f56565'
									}}
								/>
							</div>
						</div>

						{/* Social Media */}
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium">Social Media</span>
								<span className="text-sm">{citationData.socialMediaCitations}</span>
							</div>
							<div className="relative h-3 w-full overflow-hidden rounded-full bg-primary/20">
								<div 
									className="h-full transition-all rounded-full"
									style={{ 
										width: `${citationData.totalCitations > 0 ? (citationData.socialMediaCitations / citationData.totalCitations) * 100 : 0}%`,
										backgroundColor: '#7e56ee'
									}}
								/>
							</div>
						</div>

						{/* Other */}
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium">Other</span>
								<span className="text-sm">{citationData.otherCitations}</span>
							</div>
							<div className="relative h-3 w-full overflow-hidden rounded-full bg-primary/20">
								<div 
									className="h-full transition-all rounded-full"
									style={{ 
										width: `${citationData.totalCitations > 0 ? (citationData.otherCitations / citationData.totalCitations) * 100 : 0}%`,
										backgroundColor: '#9ca3af'
									}}
								/>
							</div>
						</div>
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
					<CardContent>
						<HorizontalBarChart
							data={domainChartData}
							tooltipLabel="Citations"
							getCategoryColor={getCategoryColor}
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

