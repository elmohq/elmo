import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { idlePolledJob, isPolledJobRunning, type PolledJobStatus, polledJobReducer } from "@/lib/polled-job";
import { useWriteErrorMessage } from "@/lib/write-errors";

export type { PolledJobStatus } from "@/lib/polled-job";

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 6 * 60 * 1000;

interface PolledBrandJobOptions<Done extends { status: "done" }, Started> {
	queryKey: readonly unknown[];
	start: () => Promise<Started>;
	poll: () => Promise<PolledJobStatus<Done>>;
	cancel: () => Promise<unknown>;
	onStarted?: (started: Started) => void;
	onDone: (done: Done) => void;
	onError: (message: string) => void;
	startErrorFallback: string;
	timeoutMessage: string;
}

export function usePolledBrandJob<Done extends { status: "done" }, Started = unknown>(
	options: PolledBrandJobOptions<Done, Started>,
) {
	const writeError = useWriteErrorMessage();
	const [state, dispatch] = useReducer(polledJobReducer<Done>, idlePolledJob<Done>());
	const nextRun = useRef(0);

	const latest = useRef(options);
	latest.current = options;

	const { mutate: start } = useMutation({
		mutationFn: (_run: number) => latest.current.start(),
		onSuccess: (result, run) => {
			dispatch({ type: "started", run });
			latest.current.onStarted?.(result);
		},
		onError: (err, run) => {
			dispatch({ type: "start-failed", run, error: writeError(err, latest.current.startErrorFallback) });
		},
	});

	const polling = state.status === "polling";
	const { data: status } = useQuery({
		queryKey: [...options.queryKey, "status", polling ? state.run : null],
		queryFn: () => latest.current.poll(),
		enabled: polling,
		staleTime: 0,
		gcTime: 0,
		refetchInterval: (query) => (query.state.data?.status === "pending" ? POLL_INTERVAL_MS : false),
		refetchIntervalInBackground: true,
	});

	useEffect(() => {
		if (!polling || !status) return;
		dispatch({ type: "polled", run: state.run, status });
	}, [polling, status, state]);

	useEffect(() => {
		if (state.status !== "settled") return;
		const { outcome } = state;
		if (outcome.kind === "cancelled" || outcome.kind === "timed-out") {
			latest.current.cancel().catch(() => {});
		}
		if (outcome.kind === "done") latest.current.onDone(outcome.done);
		if (outcome.kind === "failed") latest.current.onError(outcome.error);
		if (outcome.kind === "timed-out") latest.current.onError(latest.current.timeoutMessage);
	}, [state]);

	const running = isPolledJobRunning(state);
	useEffect(() => {
		if (!running) return;
		const timer = window.setTimeout(() => dispatch({ type: "timeout" }), TIMEOUT_MS);
		return () => window.clearTimeout(timer);
	}, [running]);

	const run = useCallback(() => {
		nextRun.current += 1;
		const next = nextRun.current;
		dispatch({ type: "run", run: next });
		start(next);
	}, [start]);

	return {
		running,
		run,
		cancel: useCallback(() => dispatch({ type: "cancel" }), []),
	};
}
