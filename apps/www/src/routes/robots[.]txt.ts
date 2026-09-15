import { createFileRoute } from "@tanstack/react-router";

const SITE_URL = "https://www.elmohq.com";

// Content signals (https://contentsignals.org) state how this site's content
// may be used, separately from whether a crawler may fetch it:
//   search   — building a search index, returning links and short excerpts
//   ai-input — feeding content to a model at answer time (RAG, grounding)
//   ai-train — training or fine-tuning models
// Elmo is MIT-licensed and exists to be found inside AI answers, so all three
// are granted rather than reserved.
const CONTENT_SIGNAL = "search=yes, ai-input=yes, ai-train=yes";

export const Route = createFileRoute("/robots.txt")({
	server: {
		handlers: {
			GET: async () => {
				const robots = `User-agent: *
Allow: /
Content-Signal: ${CONTENT_SIGNAL}

Sitemap: ${SITE_URL}/sitemap.xml`;

				return new Response(robots, {
					headers: { "Content-Type": "text/plain" },
				});
			},
		},
	},
});
