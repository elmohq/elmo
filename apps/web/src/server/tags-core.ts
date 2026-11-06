/**
 * There is no tag table: a tag exists as long as some prompt carries it, so
 * changing one is a prompt edit. Branded vs unbranded is the prompt type, not
 * a tag, and never appears here.
 */
import { db } from "@workspace/lib/db/db";
import { prompts } from "@workspace/lib/db/schema";
import { normalizeTag } from "@workspace/lib/tag-utils";
import { eq } from "drizzle-orm";

export interface Tag {
	name: string;
	promptCount: number;
}

export async function listBrandTags(brandId: string): Promise<Tag[]> {
	const rows = await db.select({ tags: prompts.tags }).from(prompts).where(eq(prompts.brandId, brandId));

	const counts = new Map<string, number>();
	for (const row of rows) {
		for (const tag of new Set(row.tags.map(normalizeTag))) counts.set(tag, (counts.get(tag) ?? 0) + 1);
	}

	return [...counts.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, promptCount]) => ({ name, promptCount }));
}
