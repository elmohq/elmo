/**
 * The state of a job the browser started and is waiting on.
 *
 * This was four variables — `running`, `runId`, `startedRun` and the query's
 * own data — whose combinations encoded seven states, one of which
 * (`running && startedRun !== runId`, meaning "the enqueue is in flight") had
 * no name and needed a comment to explain why it had to exist. Settling was an
 * effect that read the query and called back, so done, failed, cancel and
 * timeout all raced each other through one `setRunning(false)`.
 *
 * Naming the states makes the one thing that is actually hard here writable
 * down: a response belongs to a *run*, and a run that has been superseded —
 * because the user pressed the button again — must not settle the new one.
 * Every event carries the run it belongs to, and the reducer drops the ones
 * that have been overtaken.
 */

/** What a poll of the server says about the job. */
export type PolledJobStatus<Done extends { status: "done" }> =
	| { status: "pending" }
	| { status: "failed"; error: string }
	| Done;

export type PolledJobOutcome<Done extends { status: "done" }> =
	| { kind: "done"; done: Done }
	| { kind: "failed"; error: string }
	/** The user backed out. The queued job is cancelled; nothing is reported. */
	| { kind: "cancelled" }
	/** Waited long enough. The queued job is cancelled and the wait is reported as an error. */
	| { kind: "timed-out" };

export type PolledJobState<Done extends { status: "done" }> =
	| { status: "idle" }
	/** Asked the server to queue the job; it isn't safe to poll yet. */
	| { status: "starting"; run: number }
	/** The job is queued, so a poll will see this run rather than the last one's result. */
	| { status: "polling"; run: number }
	| { status: "settled"; run: number; outcome: PolledJobOutcome<Done> };

export type PolledJobEvent<Done extends { status: "done" }> =
	| { type: "run"; run: number }
	| { type: "started"; run: number }
	| { type: "start-failed"; run: number; error: string }
	| { type: "polled"; run: number; status: PolledJobStatus<Done> }
	| { type: "cancel" }
	| { type: "timeout" };

export function idlePolledJob<Done extends { status: "done" }>(): PolledJobState<Done> {
	return { status: "idle" };
}

/** A run the browser is still waiting on, and so the only state a response can belong to. */
export type RunningPolledJob<Done extends { status: "done" }> = Extract<
	PolledJobState<Done>,
	{ status: "starting" | "polling" }
>;

export function isPolledJobRunning<Done extends { status: "done" }>(
	state: PolledJobState<Done>,
): state is RunningPolledJob<Done> {
	return state.status === "starting" || state.status === "polling";
}

function settle<Done extends { status: "done" }>(run: number, outcome: PolledJobOutcome<Done>): PolledJobState<Done> {
	return { status: "settled", run, outcome };
}

export function polledJobReducer<Done extends { status: "done" }>(
	state: PolledJobState<Done>,
	event: PolledJobEvent<Done>,
): PolledJobState<Done> {
	// Pressing the button again always starts a new run, whatever the old one was doing.
	if (event.type === "run") return { status: "starting", run: event.run };

	// Nothing to cancel or time out when no run is in flight. Worth saying
	// explicitly: both arrive from timers and handlers that can outlive a run.
	if (event.type === "cancel" || event.type === "timeout") {
		if (!isPolledJobRunning(state)) return state;
		return settle(state.run, event.type === "cancel" ? { kind: "cancelled" } : { kind: "timed-out" });
	}

	// A response from a run that has been superseded. Dropping it is the whole
	// reason runs are numbered: the previous run's enqueue still resolves, and
	// its poll still returns the previous job's result.
	if (!isPolledJobRunning(state) || event.run !== state.run) return state;

	if (event.type === "started") return { status: "polling", run: state.run };
	if (event.type === "start-failed") return settle(state.run, { kind: "failed", error: event.error });

	// A poll that beat the enqueue would be reading the last run's job.
	if (state.status !== "polling") return state;
	const outcome = outcomeOf(event.status);
	return outcome ? settle(state.run, outcome) : state;
}

/** Null while the server is still working on it. */
function outcomeOf<Done extends { status: "done" }>(status: PolledJobStatus<Done>): PolledJobOutcome<Done> | null {
	if (status.status === "pending") return null;
	if (status.status === "failed") return { kind: "failed", error: status.error };
	return { kind: "done", done: status as Done };
}
