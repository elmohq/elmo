/**
 * "Suggest Prompts" panel for the prompts page: asks the worker for prompts
 * the brand doesn't track yet, then lets the user tick, edit, and add them to
 * the list. Added rows land in the editor unsaved, so the page's normal save
 * bar is what persists them.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { dedupeKey, describeSkipped, parseBulkPrompts } from "@workspace/lib/bulk-prompts";
import { MAX_PROMPTS, PROMPT_SUGGESTION_RUNS_PER_DAY } from "@workspace/lib/constants";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Spinner } from "@workspace/ui/components/spinner";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { trackEvent } from "@/lib/posthog";
import { useWriteErrorMessage } from "@/lib/write-errors";
import {
	cancelPromptSuggestionsFn,
	getPromptSuggestionsStatusFn,
	startPromptSuggestionsFn,
} from "@/server/prompt-suggestions";

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 6 * 60 * 1000;

interface Suggestion {
	key: string;
	value: string;
	tags: string[];
	selected: boolean;
}

interface PromptSuggestionsProps {
	brandId: string;
	/** Every filled prompt currently in the editor, saved or not. */
	existingValues: string[];
	/** Tags already used in the editor, offered alongside the suggestions' own. */
	tagOptions: string[];
	onAdd: (prompts: { value: string; tags: string[] }[]) => void;
	onClose: () => void;
}

type Phase = { name: "loading" } | { name: "ready" } | { name: "error"; message: string; retryable: boolean };

/** One run at a time: start it, poll the worker, and hand back what's new. */
function useSuggestionRuns(brandId: string, existingValues: string[]) {
	const writeError = useWriteErrorMessage();
	const [phase, setPhase] = useState<Phase>({ name: "loading" });
	const [run, setRun] = useState(0);
	const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
	const [remaining, setRemaining] = useState<number | null>(null);
	// Everything any run has offered, so the next run doesn't offer it again.
	const offered = useRef<string[]>([]);

	const { mutate: start, isSuccess: started } = useMutation({
		mutationFn: () =>
			startPromptSuggestionsFn({
				data: { brandId, exclude: [...existingValues, ...offered.current].slice(0, MAX_PROMPTS * 2) },
			}),
		onSuccess: (result) => setRemaining(result.remaining),
		onError: (err) =>
			setPhase({ name: "error", message: writeError(err, "Couldn't suggest prompts."), retryable: false }),
	});

	const requestRun = () => {
		setPhase({ name: "loading" });
		setRun((n) => n + 1);
		trackEvent("prompt_suggestions_requested");
		start();
	};

	// One run on open; later runs come from the "Suggest More" button.
	const opened = useRef(false);
	useEffect(() => {
		if (opened.current) return;
		opened.current = true;
		requestRun();
	});

	const { data: status } = useQuery({
		queryKey: ["prompt-suggestions", brandId, run],
		queryFn: () => getPromptSuggestionsStatusFn({ data: { brandId } }),
		enabled: phase.name === "loading" && started,
		staleTime: 0,
		gcTime: 0,
		refetchInterval: (query) => (query.state.data?.status === "pending" ? POLL_INTERVAL_MS : false),
		refetchIntervalInBackground: true,
	});

	useEffect(() => {
		if (phase.name !== "loading" || !status) return;
		if (status.status === "failed") {
			setPhase({ name: "error", message: status.error, retryable: true });
		} else if (status.status === "done") {
			offered.current = [...offered.current, ...status.prompts.map((p) => p.prompt)];
			// Unsaved rows can't be known to the server until the run starts, and
			// the model can still slip one through; filter again against the list.
			const onScreen = new Set(existingValues.map(dedupeKey));
			setSuggestions(
				status.prompts
					.filter((p) => !onScreen.has(dedupeKey(p.prompt)))
					.map((p) => ({ key: uuidv4(), value: p.prompt, tags: p.tags, selected: true })),
			);
			setPhase({ name: "ready" });
		}
	}, [phase.name, status, existingValues]);

	useEffect(() => {
		if (phase.name !== "loading") return;
		const timer = window.setTimeout(
			() => setPhase({ name: "error", message: "Suggesting prompts timed out. Please try again.", retryable: true }),
			TIMEOUT_MS,
		);
		return () => window.clearTimeout(timer);
	}, [phase.name]);

	const cancel = () => {
		if (phase.name === "loading") cancelPromptSuggestionsFn({ data: { brandId } }).catch(() => {});
	};

	return { phase, suggestions, setSuggestions, remaining, requestRun, cancel };
}

function SuggestionPicker({
	suggestions,
	onChange,
	existingValues,
	tagOptions,
	onAdd,
	actions,
}: {
	suggestions: Suggestion[];
	onChange: (next: Suggestion[]) => void;
	existingValues: string[];
	tagOptions: string[];
	onAdd: (prompts: { value: string; tags: string[] }[]) => void;
	/** "Suggest more" and "Cancel", which sit beside the add button. */
	actions: ReactNode;
}) {
	// Same rules as pasting a list: duplicates are skipped and named, and going
	// over the cap blocks the add instead of quietly taking what fits.
	const picked = useMemo(() => suggestions.filter((s) => s.selected && s.value.trim()), [suggestions]);
	const preview = useMemo(
		() => parseBulkPrompts(picked.map((s) => s.value).join("\n"), { existing: existingValues, limit: MAX_PROMPTS }),
		[picked, existingValues],
	);
	const overCapacity = preview.skipped.overCapacity.length;
	const notice = picked.length > 0 ? describeSkipped(preview.skipped) : null;

	const add = () => {
		if (preview.added.length === 0 || overCapacity > 0) return;
		const tagsByKey = new Map(picked.map((s) => [dedupeKey(s.value), s.tags]));
		onAdd(preview.added.map((value) => ({ value, tags: tagsByKey.get(dedupeKey(value)) ?? [] })));
		trackEvent("prompt_suggestions_added", { offered: suggestions.length, added: preview.added.length });
	};

	const update = (key: string, patch: Partial<Suggestion>) =>
		onChange(suggestions.map((s) => (s.key === key ? { ...s, ...patch } : s)));
	const allSelected = suggestions.length > 0 && suggestions.every((s) => s.selected);
	const allTagOptions = useMemo(
		() => [...new Set([...tagOptions, ...suggestions.flatMap((s) => s.tags)])].sort().map((value) => ({ value })),
		[tagOptions, suggestions],
	);

	return (
		<>
			{suggestions.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					Nothing new this time — everything suggested is already in your list.
				</p>
			) : (
				<div className="space-y-2">
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<Checkbox
							checked={allSelected}
							onCheckedChange={() => onChange(suggestions.map((s) => ({ ...s, selected: !allSelected })))}
							aria-label={allSelected ? "Deselect all suggestions" : "Select all suggestions"}
						/>
						Untick any you don't want, or edit the text and tags before adding.
					</div>
					{suggestions.map((s) => (
						<div
							key={s.key}
							className={`flex flex-wrap items-start gap-2 sm:flex-nowrap ${s.selected ? "" : "opacity-60"}`}
						>
							<div className="flex shrink-0 pt-2.5">
								<Checkbox
									checked={s.selected}
									onCheckedChange={(checked) => update(s.key, { selected: checked === true })}
									aria-label={`Include "${s.value}"`}
								/>
							</div>
							<Input
								value={s.value}
								onChange={(e) => update(s.key, { value: e.target.value })}
								aria-label="Suggested prompt"
								className="min-w-0 flex-1 bg-background"
							/>
							<div className="w-full pl-6 sm:w-80 sm:shrink-0 sm:pl-0">
								<TagsInput
									value={s.tags}
									onValueChange={(tags) => update(s.key, { tags })}
									options={allTagOptions}
									placeholder="Add tag..."
									searchPlaceholder="Search or create tag..."
									normalizeValue={(raw) => raw.toLowerCase().trim()}
								/>
							</div>
						</div>
					))}
				</div>
			)}

			<div className="flex flex-wrap items-center gap-2">
				{suggestions.length > 0 && (
					<Button size="sm" type="button" onClick={add} disabled={preview.added.length === 0 || overCapacity > 0}>
						Add {preview.added.length > 0 ? `${preview.added.length} ` : ""}
						{preview.added.length === 1 ? "Prompt" : "Prompts"}
					</Button>
				)}
				{actions}
				{notice && <span className="text-xs text-muted-foreground">{notice}</span>}
			</div>
			{overCapacity > 0 && (
				<p role="alert" className="text-xs text-destructive">
					That's {overCapacity} prompt{overCapacity === 1 ? "" : "s"} over the {MAX_PROMPTS} limit. Untick{" "}
					{overCapacity === 1 ? "one" : "some"} to continue.
				</p>
			)}
		</>
	);
}

export function PromptSuggestions({ brandId, existingValues, tagOptions, onAdd, onClose }: PromptSuggestionsProps) {
	const { phase, suggestions, setSuggestions, remaining, requestRun, cancel } = useSuggestionRuns(
		brandId,
		existingValues,
	);
	const outOfRuns = remaining !== null && remaining <= 0;

	const close = () => {
		cancel();
		onClose();
	};
	const closeButton = (label: string) => (
		<Button variant="ghost" size="sm" type="button" onClick={close}>
			{label}
		</Button>
	);

	return (
		<section aria-label="Suggested Prompts" className="space-y-3 rounded-md border bg-muted/40 p-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 className="flex items-center gap-2 text-sm font-medium">
					<Sparkles className="h-4 w-4 text-muted-foreground" /> Suggested Prompts
				</h2>
				{remaining !== null && (
					<span className="text-xs text-muted-foreground">
						{remaining} of {PROMPT_SUGGESTION_RUNS_PER_DAY} runs left today
					</span>
				)}
			</div>

			{phase.name === "loading" && (
				<div className="flex flex-wrap items-center justify-between gap-2">
					<p className="flex items-center gap-2 text-sm text-muted-foreground">
						<Spinner /> Looking for prompts you don't track yet. This usually takes about a minute.
					</p>
					{closeButton("Cancel")}
				</div>
			)}

			{phase.name === "error" && (
				<div className="space-y-2">
					<div
						role="alert"
						className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
					>
						<AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
						<span>{phase.message}</span>
					</div>
					<div className="flex items-center gap-2">
						{phase.retryable && !outOfRuns && (
							<Button variant="outline" size="sm" type="button" onClick={requestRun}>
								Try again
							</Button>
						)}
						{closeButton("Close")}
					</div>
				</div>
			)}

			{phase.name === "ready" && (
				<SuggestionPicker
					suggestions={suggestions}
					onChange={setSuggestions}
					existingValues={existingValues}
					tagOptions={tagOptions}
					onAdd={onAdd}
					actions={
						<>
							<Button
								variant="outline"
								size="sm"
								type="button"
								onClick={requestRun}
								disabled={outOfRuns}
								className="flex items-center gap-2"
							>
								<RefreshCw className="h-4 w-4" /> Suggest More
							</Button>
							{closeButton("Cancel")}
						</>
					}
				/>
			)}
		</section>
	);
}
