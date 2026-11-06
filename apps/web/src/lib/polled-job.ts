export type PolledJobStatus<Done extends { status: "done" }> =
	| { status: "pending" }
	| { status: "failed"; error: string }
	| Done;

export type PolledJobOutcome<Done extends { status: "done" }> =
	| { kind: "done"; done: Done }
	| { kind: "failed"; error: string }
	| { kind: "cancelled" }
	| { kind: "timed-out" };

export type PolledJobState<Done extends { status: "done" }> =
	| { status: "idle" }
	| { status: "starting"; run: number }
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
	if (event.type === "run") return { status: "starting", run: event.run };

	if (event.type === "cancel" || event.type === "timeout") {
		if (!isPolledJobRunning(state)) return state;
		return settle(state.run, event.type === "cancel" ? { kind: "cancelled" } : { kind: "timed-out" });
	}

	// A superseded run's enqueue still resolves and its poll still returns the old job's result.
	if (!isPolledJobRunning(state) || event.run !== state.run) return state;

	if (event.type === "started") return { status: "polling", run: state.run };
	if (event.type === "start-failed") return settle(state.run, { kind: "failed", error: event.error });

	if (state.status !== "polling") return state;
	const outcome = outcomeOf(event.status);
	return outcome ? settle(state.run, outcome) : state;
}

function outcomeOf<Done extends { status: "done" }>(status: PolledJobStatus<Done>): PolledJobOutcome<Done> | null {
	if (status.status === "pending") return null;
	if (status.status === "failed") return { kind: "failed", error: status.error };
	return { kind: "done", done: status as Done };
}
