import { defineDocs, defineConfig } from "fumadocs-mdx/config";
import { remarkFeedbackBlock } from "fumadocs-core/mdx-plugins/remark-feedback-block";

export const docs = defineDocs({
	dir: "../../packages/docs/content/docs",
	docs: {
		postprocess: {
			includeProcessedMarkdown: true,
		},
	},
});

export default defineConfig({
	mdxOptions: {
		remarkPlugins: [[remarkFeedbackBlock]],
	},
});
