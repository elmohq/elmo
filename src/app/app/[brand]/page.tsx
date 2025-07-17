"use client";

import { useState } from "react";
import Link from "next/link";
import { IconSearch, IconAward, IconTrendingUp, IconEdit, IconChevronRight } from "@tabler/icons-react";
import PromptWizard from "@/components/prompt-wizard";
import { useBrand } from "@/hooks/use-brands";
import { usePromptRuns } from "@/hooks/use-prompt-runs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default function AppPage({ params }: { params: Promise<{ org: string }> }) {
	const { brand, isLoading } = useBrand();
	const { promptRuns, isLoading: isLoadingRuns } = usePromptRuns();

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
						// The wizard will trigger a revalidation, so the page will update automatically
					}}
				/>
			</div>
		);
	}

	// Calculate metrics
	const totalPrompts = brand?.prompts?.length || 0;
	const reputationPrompts = brand?.prompts?.filter(p => p.reputation)?.length || 0;
	const searchPrompts = brand?.prompts?.filter(p => !p.reputation)?.length || 0;
	
	// Calculate prompts with recent evaluations (last 30 days)
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	
	const recentlyEvaluatedPrompts = new Set(
		promptRuns?.filter(run => new Date(run.createdAt) >= thirtyDaysAgo)
			.map(run => run.promptId) || []
	).size;

	// Mock average visibility for now (would be calculated from actual prompt run data)
	const averageVisibility = 72;

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
						<CardTitle className="font-semibold text-5xl">{brand?.name}</CardTitle>
					</CardHeader>
				</Card>

				<Card className="gap-6 py-6 shadow-sm">
					<CardHeader className="@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6">
						<CardDescription>Total Prompts Tracked</CardDescription>
						<CardTitle className="font-semibold text-5xl">{totalPrompts}</CardTitle>
					</CardHeader>
				</Card>

				<Card className="gap-6 py-6 shadow-sm">
					<CardHeader className="@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6">
						<CardDescription>Total Prompt Evaluations</CardDescription>
						<CardTitle className="font-semibold text-5xl">{promptRuns?.length || 0}</CardTitle>
					</CardHeader>
				</Card>

				<Card className="gap-6 py-6 shadow-sm">
					<CardHeader className="@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6">
						<CardDescription>Average AI Visibility</CardDescription>
						<div className="flex items-center gap-2">
							<CardTitle className="font-semibold text-5xl">{averageVisibility}%</CardTitle>
						</div>
					</CardHeader>
				</Card>
			</div>

			{/* Navigation Cards */}
			<div className="grid grid-cols-1 gap-6 md:grid-cols-2">

			<Link href="./prompts">
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
							Monitor what search queries AI models use when answering questions about your brand. 
							These prompts use underlying web search technology to fetch current information, 
							giving you visibility into which search results can be optimized to improve your brand's representation.
						</p>
					</CardContent>
				</Card>
				</Link>

				<Link href="./reputation">
				<Card className="gap-3 py-6 shadow-sm cursor-pointer hover:bg-muted/50 transition-colors">
					<CardHeader className="@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto]">
						<div className="flex items-center justify-between w-full">
							<CardTitle className="font-semibold text-lg">Brand Reputation</CardTitle>
							<Button variant="ghost" size="icon" asChild>
									<IconChevronRight className="h-4 w-4" />
							</Button>
						</div>
					</CardHeader>
					<Separator />
					<CardContent className="px-6 pb-0 pt-3">
						<p className="text-sm text-muted-foreground">
							Understand what preconceptions about your brand are built into AI models during training. 
							This represents an aggregate of data found on the web at the time each model version was created, 
							showing how your brand is represented in the model's pre-trained knowledge without real-time search.
						</p>
					</CardContent>
				</Card>
				</Link>
			</div>
		</div>
	);
}
