import { promptQueue, queueConnectionConfig } from "./queues";
import { Job, QueueEvents, Worker } from "bullmq";

const queueEvents = new QueueEvents(promptQueue.name, { connection: queueConnectionConfig });

const worker = new Worker(promptQueue.name, async (job: Job) => {
    job.log(`Processing job ${job.id}`);
}, { connection: queueConnectionConfig });   


queueEvents.on('completed', ({ jobId }) => {
    console.log('Completed job:', jobId);
});

queueEvents.on('failed',({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
    console.error('Job failed:', jobId, 'Reason:', failedReason);
});

const gracefulShutdown = async (signal: string) => {
    console.log(`Received ${signal}, closing server...`);
    await worker.close();
    // Other asynchronous closings
    process.exit(0);
  }
  
process.on('SIGINT', () => gracefulShutdown('SIGINT'));  
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
