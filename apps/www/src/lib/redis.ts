import { createServerOnlyFn } from "@tanstack/react-start";
import { Redis } from "@upstash/redis";

let client: Redis | undefined;

// The modules that cache through Redis are imported by routes for their server
// functions; a module-level client would drag the Upstash SDK into the browser
// bundle with them.
export const getRedis = createServerOnlyFn(() => {
	client ??= new Redis({
		url: process.env.UPSTASH_REDIS_REST_URL!,
		token: process.env.UPSTASH_REDIS_REST_TOKEN!,
	});
	return client;
});
