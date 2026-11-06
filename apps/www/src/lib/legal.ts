import { legal } from "collections/server";
import { loader } from "fumadocs-core/source";

// Third fumadocs source (alongside docs in @/lib/source and the blog in
// @/lib/blog) for the published legal policies. Server-only — importing this
// pulls in fumadocs-core/source and the generated server collections, so only
// import it inside server functions and server route handlers.
export const legalSource = loader({ legal: legal.toFumadocsSource() }, { baseUrl: "/legal" });

export interface LegalPageSummary {
	slug: string;
	title: string;
	description: string;
	updated: string;
}

/** Every policy, in the order the index and the footer should list them. */
export function listLegalPages(): LegalPageSummary[] {
	return legalSource
		.getPages()
		.map((page) => ({
			slug: page.slugs.join("/"),
			title: page.data.title,
			description: page.data.description ?? "",
			updated: page.data.updated,
			order: page.data.order,
		}))
		.sort((a, b) => a.order - b.order)
		.map(({ order: _order, ...page }) => page);
}
