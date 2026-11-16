/**
 * Minimal Vite config used by Storybook (and by the Vitest storybook project).
 *
 * The app's main `vite.config.ts` loads the full TanStack Start + Nitro + Sentry
 * plugin chain. Those plugins assume a single SSR entrypoint and conflict with
 * Storybook's multi-iframe bundling. This file gives the Storybook builder a
 * dedicated, plugin-light Vite config so stories can render in isolation.
 */
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Stand-in for the app's /api/site-icon route, which Storybook doesn't serve.
const siteIconRoute: Plugin = {
	name: "storybook-site-icon",
	configureServer(server) {
		server.middlewares.use("/api/site-icon", async (req, res) => {
			const params = new URLSearchParams(req.url?.split("?")[1]);
			const upstream = new URLSearchParams({
				client: "SOCIAL",
				type: "FAVICON",
				fallback_opts: "TYPE,SIZE,URL",
				url: `https://${params.get("domain")}`,
				size: params.get("size") ?? "64",
			});
			const icon = await fetch(`https://t1.gstatic.com/faviconV2?${upstream.toString()}`);
			res.statusCode = icon.status;
			if (!icon.ok) {
				res.end();
				return;
			}
			res.setHeader("Content-Type", icon.headers.get("content-type") ?? "image/png");
			res.end(Buffer.from(await icon.arrayBuffer()));
		});
	},
};

export default defineConfig({
	plugins: [tailwindcss(), viteReact(), siteIconRoute],
});
