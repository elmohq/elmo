/** Stands in for a model session: answers at once, and exits mid-passage on "crash". */
import { parentPort } from "node:worker_threads";
import type { PoolRequest, PoolResponse } from "../pool-worker";

const port = parentPort;
if (!port) throw new Error("must run in a worker thread");
port.on("message", ({ passage }: PoolRequest) => {
	if (passage === "crash") process.exit(1);
	const judgment = { reference: { brand: 1 }, sentiment: { neutral: 1 } };
	port.postMessage({ type: "result", judgment } satisfies PoolResponse);
});
port.postMessage({ type: "ready", version: "stub" } satisfies PoolResponse);
