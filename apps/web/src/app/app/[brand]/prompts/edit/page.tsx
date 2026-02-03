import { db } from "@workspace/lib/db/db";
import { prompts } from "@workspace/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, and, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PromptsEditor } from "../../../../../components/prompts-editor";

async function getPrompts(brandId: string) {
	// Verify user has access to this brand
	const userBrands = await getElmoOrgs();
	const hasAccess = userBrands.some((brand) => brand.id === brandId);

	if (!hasAccess) {
		return null;
	}

	// Fetch all prompts for this brand (including disabled ones for editing)
	const brandPrompts = await db
		.select()
		.from(prompts)
		.where(eq(prompts.brandId, brandId))
		.orderBy(desc(prompts.enabled), prompts.createdAt);

	return brandPrompts;
}

export default async function PromptsEditPage({ params }: { params: Promise<{ brand: string }> }) {
	const brandPrompts = await getPrompts((await params).brand);

	if (brandPrompts === null) {
		notFound();
	}

	return (
		<PromptsEditor
			initialPrompts={brandPrompts}
			brandId={(await params).brand}
			pageTitle="Edit Prompt Tracking"
			pageDescription="Add, edit, or remove your brand tracking keywords and prompts"
		/>
	);
}
