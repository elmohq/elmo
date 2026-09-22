import { createFileRoute } from "@tanstack/react-router";

const SITE_URL = "https://www.elmohq.com";

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
