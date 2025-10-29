"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useCitations } from "@/hooks/use-citations";
import { useBrand } from "@/hooks/use-brands";
import { CitationsDisplay } from "@/components/citations-display";

export default function CitationsPage() {
	const params = useParams();
	const brandId = params.brand as string;
	const [daysFilter, setDaysFilter] = useState(7);

	// Get brand data
	const { brand } = useBrand(brandId);

	// Get citation data
	const { data: citationData, isLoading, isError } = useCitations(brandId, { days: daysFilter });

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

			{citationData.totalCitations === 0 ? (
				<Card>
					<CardContent className="pt-6">
						<div className="text-muted-foreground text-center py-8">
							No citations found in the past {daysFilter} days. Citations are only available from prompts evaluated with web search enabled.
						</div>
					</CardContent>
				</Card>
			) : (
				<CitationsDisplay
					citationData={citationData}
					brandId={brandId}
					brandName={brand?.name}
					showStats={true}
					showPromptBreakdown={true}
					maxDomains={20}
					maxUrls={50}
				/>
			)}
		</div>
	);
}

