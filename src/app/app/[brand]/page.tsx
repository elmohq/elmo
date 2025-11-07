"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { IconSearch, IconAward, IconTrendingUp, IconEdit, IconChevronRight } from "@tabler/icons-react";
import PromptWizard from "@/components/prompt-wizard";
import { useBrand } from "@/hooks/use-brands";
import { useDashboardSummary } from "@/hooks/use-dashboard-summary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useRouter } from "next/navigation";
import { WHITE_LABEL_CONFIG } from "@/lib/white-label";

function getVisibilityTextColor(value: number): string {
	if (value > 75) return "text-emerald-600";
	if (value > 45) return "text-amber-500";
	return "text-rose-500";
}

export default function AppPage({ params }: { params: Promise<{ brand: string }> }) {
	const [brandId, setBrandId] = useState<string>("");
	const { brand, isLoading } = useBrand();
	const { dashboardSummary, isLoading: isLoadingSummary } = useDashboardSummary(brand?.id, "1m");
	const router = useRouter();

	// Get the brand ID from params
	useEffect(() => {
		params.then(({ brand }) => setBrandId(brand));
	}, [params]);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<div className="flex items-center space-x-2">
					<div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
					<span>Loading brand data...</span>
				</div>
			</div>
		);
	}

	const hasPrompts = brand?.prompts && brand.prompts.length > 0;

	if (!hasPrompts && !brand?.onboarded) {
		return (
			<div className="space-y-6 max-w-2xl">
				<div className="space-y-2">
					<h2 className="text-2xl font-bold">Research Brand Data</h2>
					<p className="text-muted-foreground text-balance">
						We will analyze your website and find the best generative AI prompts to track. This process may take a
						couple of minutes.
					</p>
				</div>
			<PromptWizard
				onComplete={() => {
					// redirect happens after the revalidation occurs, so this isn't necessary - just for redirect continuity
					const redirectUrl = WHITE_LABEL_CONFIG.onboarding_redirect_url(brandId);
					if (redirectUrl) {
						window.location.href = redirectUrl;
					}
				}}
			/>
			</div>
		);
	}

	// Get metrics from optimized summary
	const totalPrompts = dashboardSummary?.totalPrompts || 0;
	const totalRuns = dashboardSummary?.totalRuns || 0;
	const averageVisibility = dashboardSummary?.averageVisibility || 0;

	return (
		<div className="space-y-8">
			<div className="space-y-2">
				<h2 className="text-2xl font-bold">AI Engine Optimization</h2>
				<p className="text-muted-foreground text-balance">
					Monitor and optimize how AI models represent your brand across search queries and pre-trained knowledge.
				</p>
			</div>

			{/* Metrics Row */}
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card className="gap-6 py-6 shadow-sm">
					<CardHeader className="@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto]">
						<CardDescription>Brand</CardDescription>
						<CardTitle className="font-semibold text-xl sm:text-2xl md:text-3xl lg:text-4xl">{brand?.name}</CardTitle>
					</CardHeader>
				</Card>

				<Card className="gap-6 py-6 shadow-sm">
					<CardHeader className="@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6">
						<CardDescription>Prompts Tracked</CardDescription>
						<CardTitle className="font-semibold text-xl sm:text-2xl md:text-3xl lg:text-4xl">{totalPrompts.toLocaleString()}</CardTitle>
					</CardHeader>
				</Card>

				<Card className="gap-6 py-6 shadow-sm">
					<CardHeader className="@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6">
						<CardDescription>Prompt Evals (30d)</CardDescription>
						<CardTitle className="font-semibold text-xl sm:text-2xl md:text-3xl lg:text-4xl">
							{totalRuns.toLocaleString()}
						</CardTitle>
					</CardHeader>
				</Card>

				<Card 
					className="gap-6 py-6 shadow-sm" 
					title="Precentage of prompt evaluations that mention your brand (out of all prompt evaluations that mention at least one brand)."
				>
					<CardHeader className="@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6">
						<CardDescription>AI Visibility (30d)</CardDescription>
						<div className="flex items-center gap-2">
							{isLoadingSummary || !totalRuns ? (
								<CardTitle className="font-semibold text-xl sm:text-2xl md:text-3xl lg:text-4xl text-muted-foreground">
									TBD
								</CardTitle>
							) : (
								<CardTitle
									className={`font-semibold text-xl sm:text-2xl md:text-3xl lg:text-4xl ${getVisibilityTextColor(averageVisibility)}`}
								>
									{averageVisibility}%
								</CardTitle>
							)}
						</div>
					</CardHeader>
				</Card>
			</div>

			{/* Navigation Cards */}
			<div className="w-full">
				<Link href={`/app/${brandId}/prompts`}>
					<Card className="gap-3 py-6 shadow-sm cursor-pointer hover:bg-muted/50 transition-colors">
						<CardHeader className="@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto]">
							<div className="flex items-center justify-between w-full">
								<CardTitle className="font-semibold text-lg">Prompts (Using Web Search)</CardTitle>
								<Button variant="ghost" size="icon" asChild>
									<IconChevronRight className="h-4 w-4" />
								</Button>
							</div>
						</CardHeader>
						<Separator />
						<CardContent className="px-6 pb-0 pt-3">
							<p className="text-sm text-muted-foreground">
								Monitor what search queries AI models use when answering questions about your brand. These prompts use
								underlying web search technology to fetch current information, giving you visibility into which search
								results can be optimized to improve your brand's representation.
							</p>
						</CardContent>
					</Card>
				</Link>
			</div>
		</div>
	);
}
