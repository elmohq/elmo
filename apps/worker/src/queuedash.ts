import express from "express";
import { createQueueDashExpressMiddleware } from "@queuedash/api";
import { promptQueue, reportQueue } from "@workspace/lib/queues";

const app = express();

app.use(
	"/",
	createQueueDashExpressMiddleware({
		ctx: {
			queues: [
				{
					queue: promptQueue,
					displayName: "Prompts",
					type: "bullmq" as const,
				},
				{
					queue: reportQueue,
					displayName: "Reports",
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
