import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type { Judgment, MentionJudge } from "./judge";
import type { PoolRequest, PoolResponse } from "./pool-worker";

interface Task extends PoolRequest {
	resolve: (judgment: Judgment) => void;
	reject: (error: Error) => void;
}

interface Slot {
	worker: Worker;
	task: Task | null;
}

const RESPAWN_DELAY_MS = 10_000;

/**
 * Runs the judge in worker threads, one model session each. ONNX Runtime's Node binding runs
 * inference synchronously on the calling thread, so without this every passage blocks the event
 * loop and no two run at once; and one session stops getting faster past about four threads, so
 * a large machine is only used by running several.
 */
export async function loadJudgePool(dir: string, size: number, threadsPerSession: number): Promise<MentionJudge> {
	// Workers read the process environment, so this has to be set before they start.
	process.env.ORT_DISABLE_TELEMETRY ??= "1";
	const queue: Task[] = [];
	const slots: Slot[] = [];
	const workers = new Set<Worker>();
	let closed = false;
	let version = "";

	const dispatch = () => {
		for (const slot of slots) {
			if (slot.task) continue;
			const task = queue.shift();
			if (!task) return;
			slot.task = task;
			slot.worker.postMessage({ entity: task.entity, passage: task.passage } satisfies PoolRequest);
		}
	};

	// With no session left, queued passages would wait forever; failing them lets their jobs retry.
	const failQueuedIfEmpty = () => {
		if (slots.length > 0) return;
		for (const task of queue.splice(0)) task.reject(new Error("no mention judge session is running"));
	};

	const replace = () =>
		spawn().catch((error) => {
			console.error("Could not replace a mention judge session; retrying:", error);
			failQueuedIfEmpty();
			setTimeout(replace, RESPAWN_DELAY_MS);
		});

	/** Resolves once the session has loaded the model and joined the pool. */
	const spawn = () =>
		new Promise<void>((ready, failed) => {
			const worker = new Worker(join(__dirname, "pool-worker.ts"), {
				workerData: { dir, threads: threadsPerSession },
				// The worker runs under tsx like the rest of the app.
				execArgv: ["--import", "tsx"],
			});
			workers.add(worker);
			const slot: Slot = { worker, task: null };
			let started = false;
			worker.on("message", (message: PoolResponse) => {
				if (message.type === "ready") {
					started = true;
					version = message.version;
					slots.push(slot);
					ready();
					dispatch();
					return;
				}
				const task = slot.task;
				slot.task = null;
				if (message.type === "result") task?.resolve(message.judgment);
				else task?.reject(new Error(message.message));
				dispatch();
			});
			worker.on("error", (error) => {
				if (!started) failed(error);
			});
			// A crashed session fails only the passage it held; a fresh one takes its place.
			worker.on("exit", () => {
				workers.delete(worker);
				if (!started || closed) return;
				slot.task?.reject(new Error("mention judge session exited"));
				slots.splice(slots.indexOf(slot), 1);
				failQueuedIfEmpty();
				replace();
			});
		});

	try {
		await Promise.all(Array.from({ length: size }, spawn));
	} catch (error) {
		// Sessions that did load would otherwise keep their threads, and the model, alive.
		closed = true;
		await Promise.all([...workers].map((worker) => worker.terminate()));
		throw error;
	}

	return {
		version,
		judge: (entity, passage) =>
			new Promise<Judgment>((resolve, reject) => {
				if (slots.length === 0) return reject(new Error("no mention judge session is running"));
				queue.push({ entity, passage, resolve, reject });
				dispatch();
			}),
	};
}
