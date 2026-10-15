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

/**
 * Runs the judge in worker threads, one model session each. ONNX Runtime's Node binding runs
 * inference synchronously on the calling thread, so without this every passage blocks the event
 * loop and no two run at once; and one session stops getting faster past about four threads, so
 * a large machine is only used by running several.
 */
export async function loadJudgePool(dir: string, size: number, threadsPerSession: number): Promise<MentionJudge> {
	const queue: Task[] = [];
	const slots: Slot[] = [];
	let nextId = 0;
	let version = "";

	const dispatch = () => {
		for (const slot of slots) {
			if (slot.task || queue.length === 0) continue;
			slot.task = queue.shift() ?? null;
			const { id, entity, passage } = slot.task as Task;
			slot.worker.postMessage({ id, entity, passage } satisfies PoolRequest);
		}
	};

	const spawn = () =>
		new Promise<Slot>((ready, failed) => {
			const worker = new Worker(join(__dirname, "pool-worker.ts"), {
				workerData: { dir, threads: threadsPerSession },
				// The worker runs under tsx like the rest of the app.
				execArgv: ["--import", "tsx"],
			});
			const slot: Slot = { worker, task: null };
			let started = false;
			worker.on("message", (message: PoolResponse) => {
				if (message.type === "ready") {
					started = true;
					version = message.version;
					ready(slot);
					return;
				}
				const task = slot.task;
				if (message.type === "error" && message.id === null) return failed(new Error(message.message));
				slot.task = null;
				if (message.type === "result") task?.resolve(message.judgment);
				else task?.reject(new Error(message.message));
				dispatch();
			});
			// A crashed session fails only the passage it held; a fresh one takes its place.
			worker.on("error", (error) => {
				if (!started) return failed(error);
				slot.task?.reject(error instanceof Error ? error : new Error(String(error)));
			});
			worker.on("exit", () => {
				if (!started) return;
				slot.task?.reject(new Error("mention judge worker exited"));
				slots.splice(slots.indexOf(slot), 1);
				spawn()
					.then((replacement) => {
						slots.push(replacement);
						dispatch();
					})
					.catch((error) => console.error("Could not replace a mention judge worker:", error));
			});
		});

	slots.push(...(await Promise.all(Array.from({ length: size }, spawn))));

	return {
		version,
		judge: (entity, passage) =>
			new Promise<Judgment>((resolve, reject) => {
				queue.push({ id: nextId++, entity, passage, resolve, reject });
				dispatch();
			}),
	};
}
