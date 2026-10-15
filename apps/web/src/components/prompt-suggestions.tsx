import { dedupeKey } from "@workspace/lib/bulk-prompts";
import { MAX_PROMPTS } from "@workspace/lib/constants";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { AlertCircle, ArrowUp, RefreshCw, Sparkles, X } from "lucide-react";
import { type Ref, type RefObject, useEffect, useRef, useState } from "react";
import { type EditablePrompt, newPromptEntry } from "@/components/prompts-list-editor";
import { usePolledBrandJob } from "@/hooks/use-polled-brand-job";
import { trackEvent } from "@/lib/posthog";
import {
	cancelPromptSuggestionsFn,
	getPromptSuggestionsStatusFn,
	startPromptSuggestionsFn,
} from "@/server/prompt-suggestions";

export const SUGGESTION_PLACEHOLDER_ROWS = 5;

const filled = (prompts: EditablePrompt[]) => prompts.map((p) => p.value).filter((v) => v.trim());

export function usePromptSuggestions({
	brandId,
	prompts,
	setPrompts,
}: {
	brandId: string;
	prompts: EditablePrompt[];
	setPrompts: (update: (prev: EditablePrompt[]) => EditablePrompt[]) => void;
}) {
	const [error, setError] = useState<string | null>(null);
	const [nothingNew, setNothingNew] = useState(false);
	const [remaining, setRemaining] = useState<number | null>(null);
	const [arrived, setArrived] = useState({ run: 0, count: 0 });
	const offered = useRef<string[]>([]);
	const latestPrompts = useRef(prompts);
	latestPrompts.current = prompts;

	const job = usePolledBrandJob({
		queryKey: ["prompt-suggestions", brandId],
		start: () =>
			startPromptSuggestionsFn({
				data: {
					brandId,
					exclude: [...filled(latestPrompts.current), ...offered.current].slice(0, MAX_PROMPTS * 2),
				},
			}),
		poll: () => getPromptSuggestionsStatusFn({ data: { brandId } }),
		cancel: () => cancelPromptSuggestionsFn({ data: { brandId } }),
		onStarted: (result) => setRemaining(result.remaining),
		onDone: ({ prompts: suggested }) => {
			offered.current = [...offered.current, ...suggested.map((p) => p.prompt)];
			const current = filled(latestPrompts.current);
			const seen = new Set(current.map(dedupeKey));
			const fresh = suggested
				.filter((p) => !seen.has(dedupeKey(p.prompt)))
				.slice(0, Math.max(0, MAX_PROMPTS - current.length))
				.map((p) => newPromptEntry({ value: p.prompt, tags: p.tags, suggested: true }));
			setNothingNew(fresh.length === 0);
			setArrived((prev) => ({ run: prev.run + 1, count: fresh.length }));
			if (fresh.length > 0) setPrompts((prev) => [...fresh, ...prev]);
		},
		onError: setError,
		startErrorFallback: "Couldn't suggest prompts.",
		timeoutMessage: "Suggesting prompts timed out. Please try again.",
	});

	const suggestedCount = prompts.filter((p) => p.suggested && !p.id).length;

	return {
		running: job.running,
		error,
		nothingNew,
		remaining,
		suggestedCount,
		arrived,
		start: () => {
			setError(null);
			setNothingNew(false);
			trackEvent("prompt_suggestions_requested");
			job.run();
		},
		cancel: job.cancel,
		dismissAll: () => setPrompts((prev) => prev.filter((p) => !(p.suggested && !p.id))),
		clearNotice: () => {
			setError(null);
			setNothingNew(false);
		},
	};
}

type Suggestions = ReturnType<typeof usePromptSuggestions>;

function runsLeftLabel(remaining: number | null) {
	if (remaining === null) return null;
	if (remaining <= 0) return "No runs left today";
	return `${remaining} ${remaining === 1 ? "run" : "runs"} left today`;
}

function StatusMessage({ suggestions }: { suggestions: Suggestions }) {
	const { running, error, nothingNew, suggestedCount } = suggestions;
	if (running) {
		return (
			<span className="flex items-center gap-2 text-muted-foreground">
				<Spinner /> Suggesting prompts. This usually takes about a minute.
			</span>
		);
	}
	if (error) {
		return (
			<span role="alert" className="flex items-start gap-2 text-red-700 dark:text-red-300">
				<AlertCircle className="mt-0.5 size-4 shrink-0" />
				{error}
			</span>
		);
	}
	if (nothingNew && suggestedCount === 0) {
		return (
			<span className="text-muted-foreground">
				Nothing new this time. Everything suggested is already in your list.
			</span>
		);
	}
	return (
		<span className="flex items-center gap-2 text-muted-foreground">
			<Sparkles className="size-4 shrink-0 text-primary" />
			<span>
				<strong className="text-foreground">{suggestedCount}</strong> suggested{" "}
				{suggestedCount === 1 ? "prompt" : "prompts"} below. Remove any you don't want, then save to start tracking the
				rest.
			</span>
		</span>
	);
}

function StatusActions({ suggestions }: { suggestions: Suggestions }) {
	const { running, error, suggestedCount, remaining } = suggestions;
	const close = (
		<Button
			type="button"
			size="icon"
			variant="ghost"
			onClick={suggestions.clearNotice}
			aria-label="Close"
			className="size-8"
		>
			<X className="size-4" />
		</Button>
	);

	if (running) {
		return (
			<Button type="button" size="sm" variant="ghost" onClick={suggestions.cancel}>
				Cancel
			</Button>
		);
	}
	if (error) return close;

	const runsLeft = runsLeftLabel(remaining);
	return (
		<>
			{runsLeft && <span className="hidden text-xs text-muted-foreground sm:inline">{runsLeft}</span>}
			<Button
				type="button"
				size="sm"
				variant="outline"
				onClick={suggestions.start}
				disabled={remaining !== null && remaining <= 0}
				className="flex items-center gap-2"
			>
				<RefreshCw className="size-4" /> Suggest More
			</Button>
			{suggestedCount > 0 ? (
				<Button type="button" size="sm" variant="ghost" onClick={suggestions.dismissAll}>
					Dismiss All
				</Button>
			) : (
				close
			)}
		</>
	);
}

export function SuggestionsStatus({ suggestions, ref }: { suggestions: Suggestions; ref?: Ref<HTMLDivElement> }) {
	const { running, error, nothingNew, suggestedCount } = suggestions;
	if (!running && !error && !nothingNew && suggestedCount === 0) return null;

	return (
		<div
			ref={ref}
			className="flex scroll-mt-24 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
		>
			<StatusMessage suggestions={suggestions} />
			<div className="flex items-center gap-2">
				<StatusActions suggestions={suggestions} />
			</div>
		</div>
	);
}

export function SuggestionsReadyPill({
	arrived,
	target,
}: {
	arrived: { run: number; count: number };
	target: RefObject<HTMLElement | null>;
}) {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (arrived.run === 0 || arrived.count === 0 || !target.current) return;
		const rect = target.current.getBoundingClientRect();
		const offscreen = rect.bottom < 0 || rect.top > window.innerHeight;
		setVisible(offscreen);
		if (!offscreen) return;
		const observer = new IntersectionObserver(([entry]) => {
			if (entry?.isIntersecting) setVisible(false);
		});
		observer.observe(target.current);
		return () => observer.disconnect();
	}, [arrived, target]);

	if (!visible) return null;
	return (
		<button
			type="button"
			onClick={() => {
				target.current?.scrollIntoView({ behavior: "smooth", block: "start" });
				setVisible(false);
			}}
			className="fixed top-20 left-1/2 z-20 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-sm font-medium shadow-lg animate-in fade-in slide-in-from-top-2 hover:bg-accent"
		>
			<ArrowUp className="size-4" />
			{arrived.count} {arrived.count === 1 ? "suggestion" : "suggestions"} added
		</button>
	);
}
