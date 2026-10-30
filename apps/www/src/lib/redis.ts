import { createServerOnlyFn } from "@tanstack/react-start";
import { Redis } from "@upstash/redis";

let client: Redis | undefined;

export const getRedis = createServerOnlyFn(() => {
	client ??= new Redis({
		url: process.env.UPSTASH_REDIS_REST_URL!,
		token: process.env.UPSTASH_REDIS_REST_TOKEN!,
	});
	return client;
});
