import { parentPort, workerData } from "node:worker_threads";
import { type JudgedEntity, type Judgment, loadMentionJudge } from "./judge";

export interface PoolRequest {
	entity: JudgedEntity;
	passage: string;
}

export type PoolResponse =
	| { type: "ready"; version: string }
	| { type: "result"; judgment: Judgment }
	| { type: "error"; message: string };

async function main() {
	const port = parentPort;
	if (!port) throw new Error("pool-worker must run in a worker thread");
	const { dir, threads } = workerData as { dir: string; threads: number };
	// A load failure throws out of the thread, which the pool sees before the worker is ready.
	const judge = await loadMentionJudge(dir, threads);
	port.on("message", async ({ entity, passage }: PoolRequest) => {
		try {
			port.postMessage({ type: "result", judgment: await judge.judge(entity, passage) } satisfies PoolResponse);
		} catch (error) {
			port.postMessage({ type: "error", message: String(error) } satisfies PoolResponse);
		}
	});
	port.postMessage({ type: "ready", version: judge.version } satisfies PoolResponse);
}

main();
