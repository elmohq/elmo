import { db } from "@/lib/db/db";
import { prompts, competitors } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PromptsDisplay } from "../prompts/prompts-display";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

async function getPrompts(brandId: string) {
	// Verify user has access to this brand
	const userBrands = await getElmoOrgs();
	const hasAccess = userBrands.some((brand) => brand.id === brandId);

	if (!hasAccess) {
		return null;
	}

	// Fetch prompts for this brand
	const brandPrompts = await db
		.select()
		.from(prompts)
		.where(eq(prompts.brandId, brandId))
		.orderBy(prompts.group, prompts.createdAt);

	return brandPrompts;
}

async function getCompetitors(brandId: string) {
	// Verify user has access to this brand
	const userBrands = await getElmoOrgs();
	const hasAccess = userBrands.some((brand) => brand.id === brandId);

	if (!hasAccess) {
		return null;
	}

	// Fetch competitors for this brand
	const brandCompetitors = await db
		.select()
		.from(competitors)
		.where(eq(competitors.brandId, brandId))
		.orderBy(competitors.name);

	return brandCompetitors;
}

export default async function ReputationPage({ params }: { params: Promise<{ brand: string }> }) {
	const brandId = (await params).brand;
	
	const [brandPrompts, brandCompetitors] = await Promise.all([
		getPrompts(brandId),
		getCompetitors(brandId)
	]);

	if (brandPrompts === null || brandCompetitors === null) {
		notFound();
	}

	// Filter to only reputation prompts
	const reputationPrompts = brandPrompts.filter((prompt) => prompt.reputation);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">Brand Reputation</h1>
				<p className="text-muted-foreground">Monitor your brand reputation with targeted prompts and competitor tracking</p>
			</div>

			{/* Competitors Section */}
			{brandCompetitors.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Competitors</CardTitle>
						<CardDescription>Track your competitive landscape</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{brandCompetitors.map((competitor) => (
								<div key={competitor.id} className="flex flex-col space-y-2 p-4 border rounded-lg">
									<h3 className="font-semibold">{competitor.name}</h3>
									{competitor.domain && (
										<div className="flex items-center space-x-2">
											<Badge variant="secondary" className="text-xs">
												{competitor.domain}
											</Badge>
										</div>
									)}
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Reputation Prompts Section */}
			<PromptsDisplay
				prompts={reputationPrompts}
				pageTitle="Reputation Prompts"
				pageDescription="Monitor reputation-specific search terms"
			/>
		</div>
	);
}
