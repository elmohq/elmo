import { Queue } from "bullmq";

export const queueConnectionConfig = {
	host: process.env.UPSTASH_REDIS_ENDPOINT,
	port: 6379,
	password: process.env.UPSTASH_REDIS_REST_TOKEN,
	tls: {},
};

export const devPromptQueue = new Queue("prompts-dev", { connection: queueConnectionConfig });
export const prodPromptQueue = new Queue("prompts-prod", { connection: queueConnectionConfig });

export const devReportQueue = new Queue("reports-dev", { connection: queueConnectionConfig });
export const prodReportQueue = new Queue("reports-prod", { connection: queueConnectionConfig });

export const promptQueue = process.env.ENVIRONMENT === "prod" ? prodPromptQueue : devPromptQueue;
export const reportQueue = process.env.ENVIRONMENT === "prod" ? prodReportQueue : devReportQueue;
