/**
 * Tags as a view over `prompts.tags`.
 *
 * There is no tag table: a tag exists exactly as long as some prompt carries
 * it, which is why the API offers listing, renaming, and removal but no create.
 *
 * `branded` and `unbranded` are computed by Elmo from the prompt text. They
 * always appear in the list and cannot be renamed or removed — applying one to
 * a prompt as a user tag overrides the computed classification, which is a
 * prompt edit, not a tag edit.
 */
import { db } from "@workspace/lib/db/db";
import { prompts, SYSTEM_TAGS } from "@workspace/lib/db/schema";
import { isSystemTag, normalizeTag } from "@workspace/lib/tag-utils";
import { and, arrayContains, eq, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api/handler";

export interface Tag {
	name: string;
	promptCount: number;
	system: boolean;
}

function assertNotSystemTag(tag: string): void {
	if (isSystemTag(tag)) {
		throw new ApiError(
			409,
			"Conflict",
			`"${normalizeTag(tag)}" is computed from the prompt text and cannot be renamed or removed.`,
			"system_tag_immutable",
		);
	}
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

/**
 * Rename a tag across every prompt in the brand, in one statement.
 *
 * One set-based update rather than a read-then-write per prompt: the loop it
 * replaces left the brand half-renamed if it failed partway, and could clobber
 * a concurrent prompt edit with the array it had read moments earlier.
 *
 * `array_remove` then `array_append` is what merges a rename onto a tag a
 * prompt already carries — removing both spellings first means the append can't
 * leave a duplicate behind.
 */
export async function renameBrandTag(brandId: string, from: string, to: string): Promise<number> {
	assertNotSystemTag(from);
	const target = normalizeTag(to);
	assertNotSystemTag(target);
	const source = normalizeTag(from);

	if (source === target) return 0;

	const rows = await db
		.update(prompts)
		.set({
			tags: sql`array_append(array_remove(array_remove(${prompts.tags}, ${source}), ${target}), ${target})`,
		})
		.where(and(eq(prompts.brandId, brandId), arrayContains(prompts.tags, [source])))
		.returning({ id: prompts.id });

	if (rows.length === 0) {
		throw new ApiError(404, "Not Found", `Tag "${source}" not found on any prompt in this brand.`);
	}
	return rows.length;
}

/** Remove a tag from every prompt in the brand, in one statement. */
export async function removeBrandTag(brandId: string, tag: string): Promise<number> {
	assertNotSystemTag(tag);
	const target = normalizeTag(tag);

	const rows = await db
		.update(prompts)
		.set({ tags: sql`array_remove(${prompts.tags}, ${target})` })
		.where(and(eq(prompts.brandId, brandId), arrayContains(prompts.tags, [target])))
		.returning({ id: prompts.id });

	if (rows.length === 0) {
		throw new ApiError(404, "Not Found", `Tag "${target}" not found on any prompt in this brand.`);
	}
	return rows.length;
}
