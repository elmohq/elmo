import { memoryReader } from "@/lib/brand-data/memory-reader";
import { computations } from "@/lib/brand-data/worker/computations";
import type { WorkerRequest, WorkerResponse } from "@/lib/brand-data/worker/protocol";
import { brandDataStatus, removeOtherFormats, setStatusListener, syncBrandData } from "@/lib/brand-data/worker/sync";
import { clearSharedReads } from "@/lib/shared-read";

const post = (message: WorkerResponse) => self.postMessage(message);

const MAX_REMEMBERED = 200;
const remembered = new Map<string, Promise<unknown>>();

function compute(brandId: string, name: keyof typeof computations, input: unknown) {
	const key = `${brandId}|${brandDataStatus(brandId).version}|${name}|${JSON.stringify(input)}`;
	let result = remembered.get(key);
	if (!result) {
		result = computations[name](memoryReader, input as never);
		if (remembered.size >= MAX_REMEMBERED) remembered.delete(remembered.keys().next().value as string);
		remembered.set(key, result);
		result.catch(() => remembered.delete(key));
	}
	return result;
}

setStatusListener((brandId, status) => {
	for (const key of remembered.keys()) if (key.startsWith(`${brandId}|`)) remembered.delete(key);
	clearSharedReads();
	post({ type: "status", brandId, status });
});

void removeOtherFormats();

self.onmessage = async ({ data: request }: MessageEvent<WorkerRequest>) => {
	if (request.type === "sync") {
		await syncBrandData(request.brandId).catch(() => {});
		return;
	}
	try {
		post({ type: "result", id: request.id, value: await compute(request.brandId, request.name, request.input) });
	} catch (error) {
		post({ type: "error", id: request.id, message: error instanceof Error ? error.message : String(error) });
	}
};
