import { createEngine } from "@/lib/brand-data/worker/engine";
import type { WorkerRequest, WorkerResponse } from "@/lib/brand-data/worker/protocol";
import { shareAcrossTabs } from "@/lib/brand-data/worker/tabs";

const post = (message: WorkerResponse) => self.postMessage(message);

const tabs = shareAcrossTabs({
	run: (job) => run(job),
	onStatus: (brandId, state) => post({ type: "status", brandId, state }),
});
const run = createEngine((brandId, state) => tabs.status(brandId, state));

self.onmessage = async ({ data: { id, job } }: MessageEvent<WorkerRequest>) => {
	try {
		post({ type: "result", id, value: await tabs.submit(job) });
	} catch (error) {
		post({ type: "error", id, message: error instanceof Error ? error.message : String(error) });
	}
};
