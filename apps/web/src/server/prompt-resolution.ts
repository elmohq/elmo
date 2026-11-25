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
 */
import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { effectiveTags, matchesTagFilter } from "@workspace/lib/tag-utils";
import { and, eq } from "drizzle-orm";
import { localeFilter, type PromptScope } from "@/lib/prompt-scope";

export interface ResolvedPrompt {
	id: string;
	value: string;
	systemTags: string[];
	tags: string[];
}

/**
 * Resolve the in-scope prompts for a brand from filter criteria, entirely
 * server-side. Mirrors the filtering the visibility page applies to build its
 * prompt list — the tag, country and language filters from `getPromptsSummaryFn` plus the
 * search box — so the chart and visibility aggregates cover the same prompts the
 * list shows.
 *
 * Resolving here (instead of having the client serialize the full prompt-id
 * list into the GET request URL) keeps the request bounded regardless of how
 * many prompts a brand has. Shipping the id list overflowed the request URL for
 * brands with a few hundred prompts — 414 URI Too Long on Vercel, 431 Request
 * Header Fields Too Large in dev.
 */
export async function resolveFilteredPrompts(
	brandId: string,
	opts: PromptScope & { search?: string },
): Promise<ResolvedPrompt[]> {
	const allPrompts = await db
		.select({
			id: prompts.id,
			value: prompts.value,
			systemTags: prompts.systemTags,
			tags: prompts.tags,
			country: prompts.country,
			language: prompts.language,
			brandCountry: brands.country,
			brandLanguage: brands.language,
		})
		.from(prompts)
		.innerJoin(brands, eq(prompts.brandId, brands.id))
		.where(and(eq(prompts.brandId, brandId), eq(prompts.enabled, true)));

	const tagFilter = parseTagFilter(opts.tags);
	const search = opts.search?.toLowerCase();
	const [first] = allPrompts;
	const inLocale = first
		? localeFilter(opts, { country: first.brandCountry, language: first.brandLanguage })
		: () => true;

	return allPrompts
		.filter(
			(p) =>
				inLocale(p) &&
				matchesTagFilter(effectiveTags(p), tagFilter) &&
				(!search || p.value.toLowerCase().includes(search)),
		)
		.map((p) => ({
			id: p.id,
			value: p.value,
			systemTags: p.systemTags || [],
			tags: p.tags || [],
		}));
}

export function parseTagFilter(tags: string | undefined): string[] {
	return tags?.split(",").filter(Boolean) || [];
}
