import { remarkFeedbackBlock } from "fumadocs-core/mdx-plugins/remark-feedback-block";
import { pageSchema } from "fumadocs-core/source/schema";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { z } from "zod";

export const docs = defineDocs({
	dir: "../../packages/docs/content/docs",
	docs: {
		postprocess: {
			includeProcessedMarkdown: true,
		},
	},
});

// Resources blog. `author` is either a key in src/data/authors.ts (a real
// team member) or the reserved value "ai" for AI-generated posts — the byline
// renders differently for each. See src/components/author-byline.tsx.
export const blog = defineDocs({
	dir: "../../packages/docs/content/blog",
	docs: {
		schema: pageSchema.extend({
			// An unquoted date in YAML frontmatter (date: 2026-05-30) is parsed
			// into a Date, while a quoted one ("2026-05-30") stays a string.
			// Accept either and normalize to a YYYY-MM-DD string so downstream
			// code (byline, JSON-LD, RSS) only ever deals with a string.
			date: z
				.union([z.string(), z.date()])
				.transform((value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value)),
			author: z.string(),
			tags: z.array(z.string()).optional(),
		}),
	},
});

export default defineConfig({
	mdxOptions: {
		remarkPlugins: [[remarkFeedbackBlock]],
	},
});
