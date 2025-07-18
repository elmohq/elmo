import express from "express";
import { createQueueDashExpressMiddleware } from "@queuedash/api";
import { devPromptQueue, prodPromptQueue } from "@/worker/queues";

const app = express();

app.use(
	"/",
	createQueueDashExpressMiddleware({
		ctx: {
			queues: [
				{
					queue: devPromptQueue,
					displayName: "Prompts (dev)",
					type: "bullmq" as const,
				},
				{
					queue: prodPromptQueue,
					displayName: "Prompts (prod)",
					type: "bullmq" as const,
				},
			],
		},
	}),
);

const server = app.listen(0, () => {
	const port = (server.address() as any)?.port;
	console.log(`🚀 QueueDash listening on port ${port}`);
	console.log(`📊 Visit http://localhost:${port}/ to view queue dashboard`);
});
