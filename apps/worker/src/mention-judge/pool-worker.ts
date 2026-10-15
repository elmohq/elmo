import { parentPort, workerData } from "node:worker_threads";
import { type JudgedEntity, type Judgment, loadMentionJudge } from "./judge";

export interface PoolRequest {
	id: number;
	entity: JudgedEntity;
	passage: string;
}

export type PoolResponse =
	| { type: "ready"; version: string }
	| { type: "result"; id: number; judgment: Judgment }
	| { type: "error"; id: number | null; message: string };

async function main() {
	const port = parentPort;
	if (!port) throw new Error("pool-worker must run in a worker thread");
	const { dir, threads } = workerData as { dir: string; threads: number };
	try {
		const judge = await loadMentionJudge(dir, threads);
		port.on("message", async ({ id, entity, passage }: PoolRequest) => {
			try {
				port.postMessage({ type: "result", id, judgment: await judge.judge(entity, passage) } satisfies PoolResponse);
			} catch (error) {
				port.postMessage({ type: "error", id, message: String(error) } satisfies PoolResponse);
			}
		});
		port.postMessage({ type: "ready", version: judge.version } satisfies PoolResponse);
	} catch (error) {
		port.postMessage({ type: "error", id: null, message: String(error) } satisfies PoolResponse);
	}
}

main();
