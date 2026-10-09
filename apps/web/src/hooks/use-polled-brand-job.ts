/**
 * Client side of a brand background job (see @/lib/brand-jobs): start it, poll
 * until it finishes, give up after a timeout, and cancel it if the user walks
 * away. Callers decide what a result or failure means for their screen.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWriteErrorMessage } from "@/lib/write-errors";

const POLL_INTERVAL_MS = 2000;
/** Runs routinely take about a minute; past this something is stuck. */
const TIMEOUT_MS = 6 * 60 * 1000;

export type PolledJobStatus<Done extends { status: "done" }> =
	| { status: "pending" }
	| { status: "failed"; error: string }
	| Done;

export interface PolledJobError {
	message: string;
	/** False when starting was refused (a limit, a permission), so retrying won't help. */
	retryable: boolean;
}

interface PolledBrandJobOptions<Done extends { status: "done" }, Started> {
	/** Identifies the job in the query cache, e.g. `["analyze-brand", brandId]`. */
	queryKey: readonly unknown[];
	start: () => Promise<Started>;
	poll: () => Promise<PolledJobStatus<Done>>;
	cancel: () => Promise<unknown>;
	onStarted?: (started: Started) => void;
	onDone: (done: Done) => void;
	onError: (error: PolledJobError) => void;
	/** Shown when starting fails without a message of its own. */
	startErrorFallback: string;
	timeoutMessage: string;
}

export function usePolledBrandJob<Done extends { status: "done" }, Started = unknown>(
	options: PolledBrandJobOptions<Done, Started>,
) {
	const writeError = useWriteErrorMessage();
	const [running, setRunning] = useState(false);
	// Each run polls under its own key, so a finished run's cached status can't
	// end the next one the moment it starts.
	const [runId, setRunId] = useState(0);

	// Callbacks change identity every render; the effects below only care about
	// the latest ones.
	const latest = useRef(options);
	latest.current = options;

	const { mutate: start, isSuccess: started } = useMutation({
		mutationFn: () => latest.current.start(),
		onSuccess: (result) => latest.current.onStarted?.(result),
		onError: (err) => {
			setRunning(false);
			latest.current.onError({ message: writeError(err, latest.current.startErrorFallback), retryable: false });
		},
	});

	const { data: status } = useQuery({
		queryKey: [...options.queryKey, "status", runId],
		queryFn: () => latest.current.poll(),
		enabled: running && started,
		staleTime: 0,
		gcTime: 0,
		refetchInterval: (query) => (query.state.data?.status === "pending" ? POLL_INTERVAL_MS : false),
		refetchIntervalInBackground: true,
	});

	useEffect(() => {
		if (!running || !status || status.status === "pending") return;
		setRunning(false);
		if (status.status === "failed") {
			latest.current.onError({ message: (status as { error: string }).error, retryable: true });
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
			latest.current.onError({ message: latest.current.timeoutMessage, retryable: true });
		}, TIMEOUT_MS);
		return () => window.clearTimeout(timer);
	}, [running, cancel]);

	const run = useCallback(() => {
		setRunId((n) => n + 1);
		setRunning(true);
		start();
	}, [start]);

	return {
		running,
		run,
		/** Stops polling and cancels the job; a no-op when nothing is running. */
		cancel: () => {
			if (running) cancel();
		},
	};
}
