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
		.orderBy(prompts.groupCategory, prompts.createdAt);

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

	const [brandPrompts, brandCompetitors] = await Promise.all([getPrompts(brandId), getCompetitors(brandId)]);

	if (brandPrompts === null || brandCompetitors === null) {
		notFound();
	}

	// Filter to only reputation prompts
	const reputationPrompts = brandPrompts.filter((prompt) => prompt.reputation);

	return (
		<PromptsDisplay
			prompts={reputationPrompts}
			pageTitle="Reputation Prompts"
			pageDescription="See how AI perceives your brand based on its training data. Updated weekly."
			editLink={`/app/${brandId}/reputation/edit`}
		/>
	);
}
