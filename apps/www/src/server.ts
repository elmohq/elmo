import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { createRequestHandler } from "@/lib/request-handler";
import { getRouter } from "./router";

const routedMarkdown = new Set(Object.keys(getRouter().routesByPath).filter((path) => path.endsWith(".md")));

export default createServerEntry({
	fetch: createRequestHandler((request) => handler.fetch(request), routedMarkdown),
});
