import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { resolveLocale } from "@/lib/i18n";

export const getLocaleFn = createServerFn({ method: "GET" }).handler(async () => {
	const headers = getRequestHeaders();
	return resolveLocale(headers.get("cookie"), headers.get("accept-language"));
});
