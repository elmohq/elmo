import { db } from "@/lib/db/db";
import { prompts } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PromptsEditor } from "../../prompts/edit/prompts-editor";

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

export default async function ReputationEditPage({ params }: { params: Promise<{ brand: string }> }) {
	const brandPrompts = await getPrompts((await params).brand);

	if (brandPrompts === null) {
		notFound();
	}

	// Filter to only reputation prompts
	const reputationPrompts = brandPrompts.filter((prompt) => prompt.reputation);

	return (
		<PromptsEditor
			initialPrompts={reputationPrompts}
			brandId={(await params).brand}
			pageTitle="Edit Reputation Tracking"
			pageDescription="Add, edit, or remove your prompts related to tracking the reputation of your brand on LLMs."
			reputation={true}
		/>
	);
} 