import { readFile } from "node:fs/promises";
import type { DeploymentCutoverParticipant } from "@workspace/lib/deployment-cutover";
import { describe, expect, it, vi } from "vitest";
import {
	createWebDeploymentRuntimeLifecycle,
	runAfterWebDeploymentFenceReady,
	WebRuntimeDrainingError,
} from "./deployment-runtime.server";

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void } {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, reject, resolve };
}

function participant(stop: () => Promise<void> = vi.fn(async () => undefined)): DeploymentCutoverParticipant {
	return { assertHealthy: vi.fn(async () => undefined), stop };
}

describe("web deployment runtime lifecycle", () => {
	it("keeps an eager Nitro plugin as the production pre-listen readiness boundary", async () => {
		const [plugin, serverEntry, viteConfig] = await Promise.all([
			readFile(new URL("../../server/plugins/deployment-runtime.ts", import.meta.url), "utf8"),
			readFile(new URL("../server.ts", import.meta.url), "utf8"),
			readFile(new URL("../../vite.config.ts", import.meta.url), "utf8"),
		]);
		expect(plugin).toContain("await initializeWebDeploymentRuntime().participant");
		expect(serverEntry).toContain("initializeWebDeploymentRuntime()");
		expect(viteConfig).toContain('plugins: [fileURLToPath(new URL("./server/plugins/deployment-runtime.ts"');
	});

	it("does not run database-backed startup hooks before the fence is ready", async () => {
		const startup = deferred<DeploymentCutoverParticipant | undefined>();
		const startupHook = vi.fn(async () => "started");
		const starting = runAfterWebDeploymentFenceReady(startup.promise, startupHook);
		await Promise.resolve();
		expect(startupHook).not.toHaveBeenCalled();

		startup.resolve(participant());
		expect(await starting).toBe("started");
		expect(startupHook).toHaveBeenCalledOnce();
	});

	it("does not dispatch a request until the shared runtime fence is ready", async () => {
		const startup = deferred<DeploymentCutoverParticipant | undefined>();
		const handler = vi.fn(async () => new Response("ready"));
		const lifecycle = createWebDeploymentRuntimeLifecycle({
			cancelStartup: vi.fn(),
			onFatal: vi.fn(),
			participant: startup.promise,
		});

		const responsePromise = lifecycle.runRequest(handler);
		await Promise.resolve();
		expect(handler).not.toHaveBeenCalled();

		startup.resolve(participant());
		expect(await (await responsePromise).text()).toBe("ready");
		expect(handler).toHaveBeenCalledOnce();
		await lifecycle.drain();
	});

	it("re-attests the database epoch before admitting a stale application request", async () => {
		const health = deferred<void>();
		const handler = vi.fn(async () => new Response("ready"));
		const runtimeParticipant = participant();
		vi.mocked(runtimeParticipant.assertHealthy).mockImplementationOnce(() => health.promise);
		const lifecycle = createWebDeploymentRuntimeLifecycle({
			cancelStartup: vi.fn(),
			onFatal: vi.fn(),
			participant: Promise.resolve(runtimeParticipant),
		});

		const responsePromise = lifecycle.runRequest(handler);
		await Promise.resolve();
		expect(handler).not.toHaveBeenCalled();
		health.resolve();
		expect(await (await responsePromise).text()).toBe("ready");
		expect(runtimeParticipant.assertHealthy).toHaveBeenCalledOnce();
		await lifecycle.drain();
	});

	it("coalesces concurrent request attestation and caches it only for the fence health interval", async () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(0);
			const health = deferred<void>();
			const runtimeParticipant = participant();
			vi.mocked(runtimeParticipant.assertHealthy).mockImplementationOnce(() => health.promise);
			const lifecycle = createWebDeploymentRuntimeLifecycle({
				cancelStartup: vi.fn(),
				onFatal: vi.fn(),
				participant: Promise.resolve(runtimeParticipant),
			});

			const first = lifecycle.runRequest(async () => new Response("first"));
			const second = lifecycle.runRequest(async () => new Response("second"));
			await Promise.resolve();
			await Promise.resolve();
			expect(runtimeParticipant.assertHealthy).toHaveBeenCalledOnce();
			health.resolve();
			expect(await (await first).text()).toBe("first");
			expect(await (await second).text()).toBe("second");

			expect(await (await lifecycle.runRequest(async () => new Response("cached"))).text()).toBe("cached");
			expect(runtimeParticipant.assertHealthy).toHaveBeenCalledOnce();

			vi.setSystemTime(5_000);
			expect(await (await lifecycle.runRequest(async () => new Response("stale"))).text()).toBe("stale");
			expect(runtimeParticipant.assertHealthy).toHaveBeenCalledTimes(2);
			await lifecycle.drain();
		} finally {
			vi.useRealTimers();
		}
	});

	it("rejects new requests and retains the fence through in-flight work until process exit", async () => {
		const handlerCompletion = deferred<Response>();
		const calls: string[] = [];
		const stop = vi.fn(async () => undefined);
		const lifecycle = createWebDeploymentRuntimeLifecycle({
			cancelStartup: vi.fn(() => {
				calls.push("stop-accepting");
			}),
			onFatal: vi.fn(),
			participant: Promise.resolve(participant(stop)),
		});
		const request = lifecycle.runRequest(async () => {
			calls.push("request-started");
			const result = await handlerCompletion.promise;
			calls.push("request-finished");
			return result;
		});
		await vi.waitFor(() => expect(calls).toContain("request-started"));

		let drained = false;
		const draining = lifecycle.drain().then(() => {
			drained = true;
		});
		await expect(lifecycle.runRequest(async () => new Response("late request"))).rejects.toBeInstanceOf(
			WebRuntimeDrainingError,
		);
		expect(drained).toBe(false);
		expect(stop).not.toHaveBeenCalled();

		handlerCompletion.resolve(new Response(null, { status: 204 }));
		expect(await request).toMatchObject({ status: 204 });
		await draining;
		expect(calls).toEqual(["request-started", "stop-accepting", "request-finished"]);
		expect(stop).not.toHaveBeenCalled();
	});

	it("keeps the fence through streamed response completion", async () => {
		let bodyController!: ReadableStreamDefaultController<Uint8Array>;
		const stop = vi.fn(async () => undefined);
		const lifecycle = createWebDeploymentRuntimeLifecycle({
			cancelStartup: vi.fn(),
			onFatal: vi.fn(),
			participant: Promise.resolve(participant(stop)),
		});
		const response = await lifecycle.runRequest(
			async () =>
				new Response(
					new ReadableStream<Uint8Array>({
						start(controller) {
							bodyController = controller;
						},
					}),
				),
		);
		const reader = response.body?.getReader();
		const firstRead = reader?.read();
		bodyController.enqueue(new TextEncoder().encode("chunk"));
		expect(await firstRead).toMatchObject({ done: false });

		let drained = false;
		const draining = lifecycle.drain().then(() => {
			drained = true;
		});
		await Promise.resolve();
		expect(drained).toBe(false);
		expect(stop).not.toHaveBeenCalled();

		bodyController.close();
		expect(await reader?.read()).toMatchObject({ done: true });
		await draining;
		expect(stop).not.toHaveBeenCalled();
	});

	it("cancels a blocked startup during shutdown without reporting a fatal failure", async () => {
		const startup = deferred<DeploymentCutoverParticipant | undefined>();
		const onFatal = vi.fn();
		const cancelStartup = vi.fn(() => startup.reject(new Error("startup cancelled")));
		const lifecycle = createWebDeploymentRuntimeLifecycle({ cancelStartup, onFatal, participant: startup.promise });

		await lifecycle.drain();
		expect(cancelStartup).toHaveBeenCalledOnce();
		expect(onFatal).not.toHaveBeenCalled();
	});

	it("reports startup failure as fatal before serving requests", async () => {
		const startupFailure = new Error("database generation mismatch");
		const onFatal = vi.fn();
		createWebDeploymentRuntimeLifecycle({
			cancelStartup: vi.fn(),
			onFatal,
			participant: Promise.reject(startupFailure),
		});

		await vi.waitFor(() => expect(onFatal).toHaveBeenCalledWith(startupFailure));
		expect(onFatal).toHaveBeenCalledOnce();
	});
});
