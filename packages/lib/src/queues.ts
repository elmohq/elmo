import { Queue } from "bullmq";

export const queueConnectionConfig = {
	host: process.env.UPSTASH_REDIS_ENDPOINT,
	port: 6379,
	password: process.env.UPSTASH_REDIS_REST_TOKEN,
	tls: {},
};

export const promptQueue = new Queue("prompts-prod", { connection: queueConnectionConfig });
export const reportQueue = new Queue("reports-prod", { connection: queueConnectionConfig });
