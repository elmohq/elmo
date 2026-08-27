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
import { eq } from "drizzle-orm";
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

/** Returns how many prompts actually changed, which is not the same as how many carried the tag. */
export async function renameBrandTag(brandId: string, from: string, to: string): Promise<number> {
	assertNotSystemTag(from);
	const target = normalizeTag(to);
	assertNotSystemTag(target);

	const source = normalizeTag(from);
	const rows = (await brandPrompts(brandId)).filter((row) => (row.tags ?? []).map(normalizeTag).includes(source));
	if (rows.length === 0) {
		throw new ApiError(404, "Not Found", `Tag "${source}" not found on any prompt in this brand.`);
	}

	let updated = 0;
	for (const row of rows) {
		// Renaming onto a tag a prompt already carries merges the two; the Set
		// keeps that from leaving a duplicate behind.
		const next = [...new Set((row.tags ?? []).map((tag) => (normalizeTag(tag) === source ? target : normalizeTag(tag))))];
		await db.update(prompts).set({ tags: next }).where(eq(prompts.id, row.id));
		updated++;
	}
	return updated;
}

export async function removeBrandTag(brandId: string, tag: string): Promise<number> {
	assertNotSystemTag(tag);
	const target = normalizeTag(tag);

	const rows = (await brandPrompts(brandId)).filter((row) => (row.tags ?? []).map(normalizeTag).includes(target));
	if (rows.length === 0) {
		throw new ApiError(404, "Not Found", `Tag "${target}" not found on any prompt in this brand.`);
	}

	for (const row of rows) {
		const next = (row.tags ?? []).filter((existing) => normalizeTag(existing) !== target);
		await db.update(prompts).set({ tags: next }).where(eq(prompts.id, row.id));
	}
	return rows.length;
}
