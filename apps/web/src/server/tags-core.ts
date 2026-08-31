/**
 * Tags as a view over `prompts.tags`.
 *
 * There is no tag table: a tag exists exactly as long as some prompt carries
 * it, so this lists what is in use and nothing more. Changing a prompt's tags
 * is a prompt edit.
 *
 * `branded` and `unbranded` are computed by Elmo from the prompt text, so they
 * always appear in the list; applying one to a prompt as a user tag overrides
 * the computed classification.
 */
import { db } from "@workspace/lib/db/db";
import { prompts, SYSTEM_TAGS } from "@workspace/lib/db/schema";
import { isSystemTag, normalizeTag } from "@workspace/lib/tag-utils";
import { eq } from "drizzle-orm";

export interface Tag {
	name: string;
	promptCount: number;
	system: boolean;
}

async function brandPrompts(brandId: string) {
	return db
		.select({ id: prompts.id, tags: prompts.tags, systemTags: prompts.systemTags })
		.from(prompts)
		.where(eq(prompts.brandId, brandId));
}

export async function listBrandTags(brandId: string): Promise<Tag[]> {
	const rows = await brandPrompts(brandId);

	const userCounts = new Map<string, number>();
	const systemCounts = new Map<string, number>();
	for (const row of rows) {
		for (const tag of new Set((row.tags ?? []).map(normalizeTag))) {
			if (isSystemTag(tag)) systemCounts.set(tag, (systemCounts.get(tag) ?? 0) + 1);
			else userCounts.set(tag, (userCounts.get(tag) ?? 0) + 1);
		}
		for (const tag of new Set((row.systemTags ?? []).map(normalizeTag))) {
			systemCounts.set(tag, (systemCounts.get(tag) ?? 0) + 1);
		}
	}

	// System tags first, then user tags alphabetically — the order the
	// dashboard's filter shows, so a client building the same UI needs no sort.
	const system = Object.values(SYSTEM_TAGS).map((name) => ({
		name,
		promptCount: systemCounts.get(name) ?? 0,
		system: true,
	}));
	const user = [...userCounts.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, promptCount]) => ({ name, promptCount, system: false }));

	return [...system, ...user];
}
