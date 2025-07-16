import { db } from "@/lib/db/db";
import { prompts } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PromptsEditor } from "./prompts-editor";

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

export default async function PromptsEditPage({ params }: { params: Promise<{ brand: string }> }) {
	const brandPrompts = await getPrompts((await params).brand);

	if (brandPrompts === null) {
		notFound();
	}

	// Filter to only non-reputation prompts
	const nonReputationPrompts = brandPrompts.filter((prompt) => !prompt.reputation);

	return (
		<PromptsEditor
			initialPrompts={nonReputationPrompts}
			brandId={(await params).brand}
			pageTitle="Edit Prompt Tracking"
			pageDescription="Add, edit, or remove your brand tracking keywords and prompts"
			reputation={false}
		/>
	);
} 