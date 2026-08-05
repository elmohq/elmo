export interface WorkerGracefulShutdown {
	removeReadiness(): Promise<void>;
	drainJobs(): Promise<void>;
	shutdownObservability(): Promise<void>;
}

/** Drains process work without unlocking the runtime fence before process exit. */
export async function drainWorkerGracefully(input: WorkerGracefulShutdown): Promise<void> {
	const errors: unknown[] = [];
	try {
		await input.removeReadiness();
	} catch (error) {
		errors.push(error);
	}

	// A failed drain means handlers may still be writing. Do not voluntarily
	// release the fence; the caller terminates the process so its DB sessions
	// and advisory lock disappear together.
	await input.drainJobs();

	try {
		await input.shutdownObservability();
	} catch (error) {
		errors.push(error);
	}

	if (errors.length === 1) throw errors[0];
	if (errors.length > 1) throw new AggregateError(errors, "Worker shutdown encountered multiple failures");
}
