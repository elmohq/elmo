import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWriteErrorMessage } from "@/lib/write-errors";

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 6 * 60 * 1000;

export type PolledJobStatus<Done extends { status: "done" }> =
	| { status: "pending" }
	| { status: "failed"; error: string }
	| Done;

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
	const [running, setRunning] = useState(false);
	const [runId, setRunId] = useState(0);
	// Polling waits for this run's enqueue: the previous run's mutation still
	// reads as successful until the new one is under way, and polling before
	// the new job exists would return the old job's result.
	const [startedRun, setStartedRun] = useState<number | null>(null);

	const latest = useRef(options);
	latest.current = options;

	const { mutate: start } = useMutation({
		mutationFn: (_run: number) => latest.current.start(),
		onSuccess: (result, run) => {
			setStartedRun(run);
			latest.current.onStarted?.(result);
		},
		onError: (err) => {
			setRunning(false);
			latest.current.onError(writeError(err, latest.current.startErrorFallback));
		},
	});

	const { data: status } = useQuery({
		queryKey: [...options.queryKey, "status", runId],
		queryFn: () => latest.current.poll(),
		enabled: running && startedRun === runId,
		staleTime: 0,
		gcTime: 0,
		refetchInterval: (query) => (query.state.data?.status === "pending" ? POLL_INTERVAL_MS : false),
		refetchIntervalInBackground: true,
	});

	useEffect(() => {
		if (!running || !status || status.status === "pending") return;
		setRunning(false);
		if (status.status === "failed") {
			latest.current.onError((status as { error: string }).error);
		} else {
			latest.current.onDone(status as Done);
		}
	}, [running, status]);

	const cancel = useCallback(() => {
		setRunning(false);
		latest.current.cancel().catch(() => {});
	}, []);

	useEffect(() => {
		if (!running) return;
		const timer = window.setTimeout(() => {
			cancel();
			latest.current.onError(latest.current.timeoutMessage);
		}, TIMEOUT_MS);
		return () => window.clearTimeout(timer);
	}, [running, cancel]);

	const run = useCallback(() => {
		const next = runId + 1;
		setRunId(next);
		setRunning(true);
		start(next);
	}, [start, runId]);

	return {
		running,
		run,
		cancel: () => {
			if (running) cancel();
		},
	};
}
