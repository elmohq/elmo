import type { DeploymentCutoverParticipant } from "@workspace/lib/deployment-cutover";
import { startCredentialRefresh } from "@workspace/lib/secrets";
import {
	createWebDeploymentRuntimeLifecycle,
	runAfterWebDeploymentFenceReady,
	startWebDeploymentCutoverParticipant,
	type WebDeploymentRuntimeLifecycle,
} from "./deployment-runtime.server";

export interface WebDeploymentRuntimeState {
	lifecycle: WebDeploymentRuntimeLifecycle;
	participant: Promise<DeploymentCutoverParticipant | undefined>;
}

const sharedGlobal = globalThis as typeof globalThis & {
	__elmoWebDeploymentRuntime?: WebDeploymentRuntimeState;
};

export function initializeWebDeploymentRuntime(): WebDeploymentRuntimeState {
	if (sharedGlobal.__elmoWebDeploymentRuntime) return sharedGlobal.__elmoWebDeploymentRuntime;

	let fatalRuntimeExitStarted = false;
	let gracefulRuntimeExitStarted = false;
	function terminateForRuntimeFenceFailure(error: Error): void {
		if (fatalRuntimeExitStarted) return;
		fatalRuntimeExitStarted = true;
		console.error("Deployment runtime fence failed; terminating web server immediately:", error);
		process.exit(1);
	}

	const runtimeFenceStartup = new AbortController();
	const participant = startWebDeploymentCutoverParticipant({
		onFatal: terminateForRuntimeFenceFailure,
		startupSignal: runtimeFenceStartup.signal,
	});
	const lifecycle = createWebDeploymentRuntimeLifecycle({
		cancelStartup: () => runtimeFenceStartup.abort(),
		onFatal: terminateForRuntimeFenceFailure,
		participant,
	});
	const state = { lifecycle, participant };
	sharedGlobal.__elmoWebDeploymentRuntime = state;

	// Credential refresh may query the application database. Keep it behind the
	// cutover fence, but do not delay requests on a temporarily unavailable store.
	void runAfterWebDeploymentFenceReady(participant, startCredentialRefresh).catch(() => undefined);

	function drainWebRuntime(signal: "SIGINT" | "SIGTERM"): void {
		if (gracefulRuntimeExitStarted) return;
		gracefulRuntimeExitStarted = true;
		console.log(`Received ${signal}, draining web requests before process exit closes the deployment runtime fence...`);
		void lifecycle
			.drain()
			.then(() => process.exit(0))
			.catch((error: unknown) => {
				console.error("Web shutdown failed:", error);
				process.exit(1);
			});
	}

	process.on("SIGTERM", () => drainWebRuntime("SIGTERM"));
	process.on("SIGINT", () => drainWebRuntime("SIGINT"));
	return state;
}
