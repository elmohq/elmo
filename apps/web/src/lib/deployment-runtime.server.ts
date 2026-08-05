import {
	type DeploymentCutoverParticipant,
	ELMO_RUNTIME_FENCE_HEALTH_CHECK_INTERVAL_MS,
	loadDeploymentRuntimeFenceConfig,
	startDeploymentCutoverParticipant,
} from "@workspace/lib/deployment-cutover";

type WebRuntimeState = "accepting" | "draining" | "failed" | "stopped";

export class WebRuntimeDrainingError extends Error {
	constructor() {
		super("The web runtime is draining and cannot accept a new request");
		this.name = "WebRuntimeDrainingError";
	}
}

export interface WebDeploymentRuntimeLifecycle {
	runRequest(handler: () => Promise<Response>): Promise<Response>;
	drain(): Promise<void>;
}

export async function runAfterWebDeploymentFenceReady<T>(
	participant: Promise<DeploymentCutoverParticipant | undefined>,
	start: () => Promise<T>,
): Promise<T> {
	await participant;
	return start();
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function createRequestCompletion(): { promise: Promise<void>; release(): void } {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}

function trackResponseCompletion(response: Response, releaseRequest: () => void): Response {
	if (!response.body) {
		releaseRequest();
		return response;
	}

	const reader = response.body.getReader();
	let released = false;
	const releaseOnce = () => {
		if (released) return;
		released = true;
		releaseRequest();
	};
	const trackedBody = new ReadableStream<Uint8Array>({
		async cancel(reason) {
			try {
				await reader.cancel(reason);
			} finally {
				releaseOnce();
			}
		},
		async pull(controller) {
			try {
				const chunk = await reader.read();
				if (chunk.done) {
					releaseOnce();
					controller.close();
				} else {
					controller.enqueue(chunk.value);
				}
			} catch (error) {
				releaseOnce();
				controller.error(error);
			}
		},
	});

	try {
		return new Response(trackedBody, {
			headers: response.headers,
			status: response.status,
			statusText: response.statusText,
		});
	} catch (error) {
		releaseOnce();
		void reader.cancel(error).catch(() => undefined);
		throw error;
	}
}

export function createWebDeploymentRuntimeLifecycle(input: {
	participant: Promise<DeploymentCutoverParticipant | undefined>;
	cancelStartup(): void;
	onFatal(error: Error): void;
}): WebDeploymentRuntimeLifecycle {
	let state: WebRuntimeState = "accepting";
	let drainPromise: Promise<void> | undefined;
	let requestAttestation: Promise<void> | undefined;
	let lastRequestAttestationAt: number | undefined;
	const activeRequests = new Set<Promise<void>>();
	const assertParticipantHealthy = async (participant: DeploymentCutoverParticipant | undefined): Promise<void> => {
		if (!participant) return;
		const now = Date.now();
		if (
			lastRequestAttestationAt !== undefined &&
			now >= lastRequestAttestationAt &&
			now - lastRequestAttestationAt < ELMO_RUNTIME_FENCE_HEALTH_CHECK_INTERVAL_MS
		) {
			return;
		}
		requestAttestation ??= participant
			.assertHealthy()
			.then(() => {
				lastRequestAttestationAt = Date.now();
			})
			.finally(() => {
				requestAttestation = undefined;
			});
		await requestAttestation;
	};

	void input.participant.catch((error: unknown) => {
		if (state !== "accepting") return;
		state = "failed";
		input.onFatal(asError(error));
	});

	return {
		async runRequest(handler: () => Promise<Response>): Promise<Response> {
			if (state !== "accepting") throw new WebRuntimeDrainingError();

			const completion = createRequestCompletion();
			activeRequests.add(completion.promise);
			void completion.promise.then(() => activeRequests.delete(completion.promise));
			try {
				const participant = await input.participant;
				// Serverless runtimes can be frozen between timer ticks. Re-attest at
				// request admission after the health interval; concurrent requests share
				// one query so a thawed instance fails closed without serializing traffic.
				await assertParticipantHealthy(participant);
				if (state !== "accepting") throw new WebRuntimeDrainingError();
				return trackResponseCompletion(await handler(), completion.release);
			} catch (error) {
				completion.release();
				throw error;
			}
		},
		drain() {
			drainPromise ??= (async () => {
				if (state === "stopped") return;
				state = "draining";
				input.cancelStartup();
				await Promise.allSettled([...activeRequests]);
				activeRequests.clear();
				await input.participant.catch(() => undefined);
				state = "stopped";
			})();
			return drainPromise;
		},
	};
}

export async function startWebDeploymentCutoverParticipant(input: {
	startupSignal: AbortSignal;
	onFatal(error: Error): void;
}): Promise<DeploymentCutoverParticipant | undefined> {
	const config = await loadDeploymentRuntimeFenceConfig();
	if (!config) return undefined;

	const participant = await startDeploymentCutoverParticipant({
		...config,
		applicationName: "elmo-web-runtime-fence",
		onFatal: input.onFatal,
		startupSignal: input.startupSignal,
	});
	console.log(`Deployment runtime fence ${config.fenceGeneration} acquired`);
	return participant;
}
