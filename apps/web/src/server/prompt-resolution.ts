/**
 * Server-only prompt resolution shared by the visibility and analysis server
 * functions.
 *
 * This lives in its own module — rather than being exported from a server-fn
 * file like `server/visibility.ts` — on purpose. A server fn file's `.handler`
 * bodies (and the imports only they use) get tree-shaken out of the client
 * bundle. But the moment a helper like this is *exported* from such a file and
 * imported elsewhere, the bundler must keep it, which dragged `db` → pg →
 * `Buffer` into the visibility page's client bundle ("Buffer is not defined").
 * Keeping it here, imported only inside server-fn handlers, stays strippable.
 * See issue #68.
 */
import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import {
	type BrandIdentity,
	matchesPromptFilter,
	parsePromptFilter,
	type ResolvedPromptType,
	resolvePromptType,
} from "@workspace/lib/prompt-type";
import { and, eq } from "drizzle-orm";

export interface ResolvedPrompt extends ResolvedPromptType {
	id: string;
	value: string;
	tags: string[];
}

export async function loadBrandIdentity(brandId: string): Promise<BrandIdentity> {
	const [brand] = await db
		.select({
			name: brands.name,
			website: brands.website,
			aliases: brands.aliases,
			additionalDomains: brands.additionalDomains,
		})
		.from(brands)
		.where(eq(brands.id, brandId))
		.limit(1);
	if (!brand) throw new Error("Brand not found");
	return brand;
}

/** Every enabled prompt in the brand, with its branded/unbranded type resolved
 *  against the brand as it is now. */
export async function loadTypedPrompts(brandId: string): Promise<ResolvedPrompt[]> {
	const [brand, rows] = await Promise.all([
		loadBrandIdentity(brandId),
		db
			.select({ id: prompts.id, value: prompts.value, tags: prompts.tags, brandedOverride: prompts.brandedOverride })
			.from(prompts)
			.where(and(eq(prompts.brandId, brandId), eq(prompts.enabled, true))),
	]);
	return rows.map((row) => ({
		id: row.id,
		value: row.value,
		tags: row.tags,
		...resolvePromptType(row, brand),
	}));
}

/**
 * Resolve the in-scope prompts for a brand from filter criteria, entirely
 * server-side, with the same tag/type matching the visibility page's prompt
 * list uses, so the chart and visibility aggregates cover the prompts the list
 * shows.
 *
 * Resolving here (instead of having the client serialize the full prompt-id
 * list into the GET request URL) keeps the request bounded regardless of how
 * many prompts a brand has. Shipping the id list overflowed the request URL for
 * brands with a few hundred prompts — 414 URI Too Long on Vercel, 431 Request
 * Header Fields Too Large in dev. See issue #68.
 */
export async function resolveFilteredPrompts(
	brandId: string,
	opts: { tags?: string; type?: string; search?: string },
): Promise<ResolvedPrompt[]> {
	const filter = parsePromptFilter(opts);
	const search = opts.search?.toLowerCase();
	return (await loadTypedPrompts(brandId)).filter(
		(p) => matchesPromptFilter(p, filter) && (!search || p.value.toLowerCase().includes(search)),
	);
}
