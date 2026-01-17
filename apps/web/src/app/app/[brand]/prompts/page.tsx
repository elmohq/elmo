import { db } from "@/lib/db/db";
import { prompts } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PromptsDisplay } from "./prompts-display";
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
		.orderBy(prompts.groupCategory, prompts.createdAt);

	return brandPrompts;
}

export default async function PromptsPage({ params }: { params: Promise<{ brand: string }> }) {
	const brandId = (await params).brand;
	const brandPrompts = await getPrompts(brandId);

	if (brandPrompts === null) {
		notFound();
	}

	const infoContent = (
		<p>Track how different LLMs respond to prompts related to your brand, products, and <Link href={`/app/${brandId}/settings`} className="underline">competitors</Link>.</p>
	);

	return (
		<PromptsDisplay
			prompts={brandPrompts}
			pageTitle="Prompts"
			pageDescription="See how LLMs are evaluating prompts related to your brand."
			pageInfoContent={infoContent}
			editLink={`/app/${brandId}/prompts/edit`}
		/>
	);
}
