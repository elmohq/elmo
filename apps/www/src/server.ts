import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { createRequestHandler } from "@/lib/request-handler";

export default createServerEntry({
	fetch: createRequestHandler((request) => handler.fetch(request)),
});
