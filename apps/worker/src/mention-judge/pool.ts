import { availableParallelism } from "node:os";
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

/** One session gets no faster past about four threads; more cores are used by adding sessions. */
const SINGLE_SESSION_THREADS = 4;

/**
 * Runs the judge in worker threads, one model session each. ONNX Runtime's Node binding runs
 * inference synchronously on the calling thread, so without this every passage blocks the event
 * loop and no two run at once; and one session stops getting faster past about four threads, so
 * a large machine is only used by running several.
 */
export async function loadJudgePool(
	dir: string,
	size: number,
	script = join(__dirname, "pool-worker.ts"),
): Promise<MentionJudge> {
	// The native library reads the real process environment, which workers only get a copy of.
	process.env.ORT_DISABLE_TELEMETRY ??= "1";
	const threads = size === 1 ? Math.min(SINGLE_SESSION_THREADS, availableParallelism()) : 1;
	const queue: Task[] = [];
	const slots: Slot[] = [];
	const workers = new Set<Worker>();
	/** Sessions on their way to replace crashed ones; queued passages wait for them. */
	let replacing = 0;
	let closed = false;
	let version = "";

	const dispatch = () => {
		for (const slot of slots) {
			if (slot.task) continue;
			const task = queue.shift();
			if (!task) return;
			slot.task = task;
			// Only a session with work keeps the process alive, so scripts that load the judge can exit.
			slot.worker.ref();
			slot.worker.postMessage({ entity: task.entity, passage: task.passage } satisfies PoolRequest);
		}
	};

	const unavailable = () => slots.length === 0 && replacing === 0;

	// With no session left or coming, queued passages would wait forever; failing them lets their jobs retry.
	const failQueuedIfUnavailable = () => {
		if (!unavailable()) return;
		for (const task of queue.splice(0)) task.reject(new Error("no mention judge session is running"));
	};

	const replace = () => {
		replacing++;
		spawn().then(
			() => {
				replacing--;
			},
			(error) => {
				console.error("Could not replace a mention judge session; retrying:", error);
				setTimeout(replace, RESPAWN_DELAY_MS);
				replacing--;
				failQueuedIfUnavailable();
			},
		);
	};

	/** Resolves once the session has loaded the model and joined the pool. */
	const spawn = () =>
		new Promise<void>((ready, failed) => {
			const worker = new Worker(script, {
				workerData: { dir, threads },
				// The worker runs under tsx like the rest of the app.
				execArgv: ["--import", "tsx"],
			});
			workers.add(worker);
			const slot: Slot = { worker, task: null };
			let started = false;
			let crash: Error | undefined;
			worker.on("message", (message: PoolResponse) => {
				if (message.type === "ready") {
					// Held while loading, which nothing else may be waiting on; idle from here on.
					worker.unref();
					started = true;
					version = message.version;
					slots.push(slot);
					ready();
					dispatch();
					return;
				}
				const task = slot.task;
				slot.task = null;
				worker.unref();
				if (message.type === "result") task?.resolve(message.judgment);
				else task?.reject(new Error(message.message));
				dispatch();
			});
			worker.on("error", (error: Error) => {
				crash = error;
			});
			// A crashed session fails only the passage it held; a fresh one takes its place.
			worker.on("exit", (code) => {
				workers.delete(worker);
				if (!started)
					return failed(crash ?? new Error(`mention judge session exited with code ${code} before loading`));
				if (closed) return;
				slot.task?.reject(crash ?? new Error("mention judge session exited"));
				slots.splice(slots.indexOf(slot), 1);
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
				if (unavailable()) return reject(new Error("no mention judge session is running"));
				queue.push({ entity, passage, resolve, reject });
				dispatch();
			}),
	};
}
