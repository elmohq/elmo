import { db } from "@workspace/lib/db/db";
import { prompts } from "@workspace/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PromptsDisplay } from "../prompts/prompts-display";
import Link from "next/link";

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
		.orderBy(prompts.createdAt);

	return brandPrompts;
}

export default async function VisibilityPage({ params }: { params: Promise<{ brand: string }> }) {
	const brandId = (await params).brand;
	const brandPrompts = await getPrompts(brandId);

	if (brandPrompts === null) {
		notFound();
	}

	const infoContent = (
		<>Track how different LLMs respond to prompts related to your brand, products, and <Link href={`/app/${brandId}/settings/competitors`} className="underline">competitors</Link>.</>
	);

	return (
		<PromptsDisplay
			prompts={brandPrompts}
			pageTitle="Visibility"
			pageDescription="See how LLMs are evaluating prompts related to your brand."
			pageInfoContent={infoContent}
			editLink={`/app/${brandId}/settings/prompts`}
		/>
	);
}
