/**
 * "Suggest Prompts" panel for the prompts page: asks the worker for prompts
 * the brand doesn't track yet, then lets the user tick, edit, and add them to
 * the list. Added rows land in the editor unsaved, so the page's normal save
 * bar is what persists them.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { dedupeKey, describeSkipped, parseBulkPrompts } from "@workspace/lib/bulk-prompts";
import { MAX_PROMPTS } from "@workspace/lib/constants";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Spinner } from "@workspace/ui/components/spinner";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { cn } from "@workspace/ui/lib/utils";
import { AlertCircle, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/** Rows share one column layout so text and tags line up down the list. */
const ROW_GRID =
	"grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 sm:grid-cols-[1rem_minmax(0,1fr)_16rem]";

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

interface RunError {
	message: string;
	/** False when starting was refused (e.g. the daily limit), so retrying can't help. */
	retryable: boolean;
}

/**
 * Runs accumulate: "Suggest More" appends to what's on screen rather than
 * replacing it, so ticks and edits on earlier suggestions survive.
 */
function useSuggestionRuns(brandId: string, existingValues: string[]) {
	const writeError = useWriteErrorMessage();
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<RunError | null>(null);
	const [run, setRun] = useState(0);
	const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
	const [remaining, setRemaining] = useState<number | null>(null);
	// Everything any run has offered, so the next run doesn't offer it again.
	const offered = useRef<string[]>([]);

	const fail = useCallback((next: RunError) => {
		setLoading(false);
		setError(next);
	}, []);

	const { mutate: start, isSuccess: started } = useMutation({
		mutationFn: () =>
			startPromptSuggestionsFn({
				data: { brandId, exclude: [...existingValues, ...offered.current].slice(0, MAX_PROMPTS * 2) },
			}),
		onSuccess: (result) => setRemaining(result.remaining),
		onError: (err) => fail({ message: writeError(err, "Couldn't suggest prompts."), retryable: false }),
	});

	const requestRun = () => {
		setLoading(true);
		setError(null);
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
		enabled: loading && started,
		staleTime: 0,
		gcTime: 0,
		refetchInterval: (query) => (query.state.data?.status === "pending" ? POLL_INTERVAL_MS : false),
		refetchIntervalInBackground: true,
	});

	useEffect(() => {
		if (!loading || !status) return;
		if (status.status === "failed") {
			fail({ message: status.error, retryable: true });
		} else if (status.status === "done") {
			offered.current = [...offered.current, ...status.prompts.map((p) => p.prompt)];
			setSuggestions((prev) => {
				// Unsaved rows can't be known to the server until the run starts, and
				// the model can still slip one through; filter again against the list.
				const seen = new Set([...existingValues, ...prev.map((s) => s.value)].map(dedupeKey));
				const fresh = status.prompts
					.filter((p) => !seen.has(dedupeKey(p.prompt)))
					.map((p) => ({ key: uuidv4(), value: p.prompt, tags: p.tags, selected: true }));
				return [...prev, ...fresh];
			});
			setLoading(false);
		}
	}, [loading, status, existingValues, fail]);

	useEffect(() => {
		if (!loading) return;
		const timer = window.setTimeout(
			() => fail({ message: "Suggesting prompts timed out. Please try again.", retryable: true }),
			TIMEOUT_MS,
		);
		return () => window.clearTimeout(timer);
	}, [loading, fail]);

	const cancel = () => {
		if (loading) cancelPromptSuggestionsFn({ data: { brandId } }).catch(() => {});
	};

	return { loading, error, suggestions, setSuggestions, remaining, requestRun, cancel };
}

function SuggestionRow({
	suggestion,
	tagOptions,
	onChange,
}: {
	suggestion: Suggestion;
	tagOptions: { value: string }[];
	onChange: (patch: Partial<Suggestion>) => void;
}) {
	return (
		<li className={cn(ROW_GRID, "px-4 py-2 transition-colors hover:bg-muted/40")}>
			<Checkbox
				checked={suggestion.selected}
				onCheckedChange={(checked) => onChange({ selected: checked === true })}
				aria-label={`Include "${suggestion.value}"`}
			/>
			{/* Borderless until hovered or focused, so the list reads as a checklist
			    rather than a form, while every field stays editable in place. */}
			<Input
				value={suggestion.value}
				onChange={(e) => onChange({ value: e.target.value })}
				aria-label="Suggested prompt"
				className={cn(
					"-ml-2 h-8 border-transparent bg-transparent px-2 shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent",
					!suggestion.selected && "text-muted-foreground line-through decoration-muted-foreground/50",
				)}
			/>
			<TagsInput
				value={suggestion.tags}
				onValueChange={(tags) => onChange({ tags })}
				options={tagOptions}
				placeholder="Add tag..."
				searchPlaceholder="Search or create tag..."
				normalizeValue={(raw) => raw.toLowerCase().trim()}
				className={cn("col-start-2 sm:col-start-auto", !suggestion.selected && "opacity-50")}
				triggerClassName="border-transparent bg-transparent shadow-none hover:border-input"
			/>
		</li>
	);
}

function LoadingRows() {
	return (
		<>
			{[0.7, 0.5, 0.62, 0.45].map((width) => (
				<li key={width} aria-hidden className={cn(ROW_GRID, "px-4 py-3.5")}>
					<Skeleton className="size-4 rounded-[4px]" />
					<Skeleton className="h-4" style={{ width: `${width * 100}%` }} />
					<Skeleton className="hidden h-5 w-16 rounded-md sm:block" />
				</li>
			))}
		</>
	);
}

function RunButton({
	loading,
	label,
	disabled,
	onClick,
}: {
	loading: boolean;
	label: string;
	disabled: boolean;
	onClick: () => void;
}) {
	return (
		<Button
			variant="outline"
			size="sm"
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="flex items-center gap-2"
		>
			{loading ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
			{loading ? "Suggesting…" : label}
		</Button>
	);
}

function AddButton({ count, disabled, onClick }: { count: number; disabled: boolean; onClick: () => void }) {
	return (
		<Button
			size="sm"
			type="button"
			onClick={onClick}
			disabled={disabled || count === 0}
			className="flex items-center gap-2"
		>
			<Plus className="h-4 w-4" />
			Add {count > 0 ? `${count} ` : ""}
			{count === 1 ? "Prompt" : "Prompts"}
		</Button>
	);
}

function PanelHeader({ status, onClose }: { status: "searching" | "picking" | "idle"; onClose: () => void }) {
	return (
		<header className="flex items-start justify-between gap-4 border-b px-4 py-3">
			<div className="flex items-start gap-3">
				<div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
					<Sparkles className="size-4" />
				</div>
				<div>
					<h2 className="text-sm font-semibold">Suggested Prompts</h2>
					<p className="text-sm text-muted-foreground">
						{
							{
								searching: "Finding prompts you don't track yet. This usually takes about a minute.",
								picking:
									"Based on your website and the prompts you already track. Untick any you don't want, or edit them first.",
								idle: "Prompts your brand doesn't track yet, based on your website and current list.",
							}[status]
						}
					</p>
				</div>
			</div>
			<Button variant="ghost" size="icon" type="button" onClick={onClose} aria-label="Close suggestions">
				<X className="size-4" />
			</Button>
		</header>
	);
}

function PanelFooter({
	suggestions,
	allSelected,
	onToggleAll,
	notice,
	overCapacity,
	remaining,
	actions,
}: {
	suggestions: Suggestion[];
	allSelected: boolean;
	onToggleAll: () => void;
	notice: string | null;
	overCapacity: number;
	remaining: number | null;
	actions: ReactNode;
}) {
	const selectedCount = suggestions.filter((s) => s.selected).length;
	return (
		<footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t bg-muted/30 px-4 py-3">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
				{suggestions.length > 0 && (
					<>
						<span>
							<strong className="text-foreground">{selectedCount}</strong> of {suggestions.length} selected
						</span>
						<button
							type="button"
							onClick={onToggleAll}
							className="cursor-pointer underline-offset-2 hover:text-foreground hover:underline"
						>
							{allSelected ? "Deselect all" : "Select all"}
						</button>
					</>
				)}
				{notice && <span>{notice}</span>}
				{overCapacity > 0 && (
					<span role="alert" className="text-destructive">
						{overCapacity} over the {MAX_PROMPTS}-prompt limit. Untick {overCapacity === 1 ? "one" : "some"} to
						continue.
					</span>
				)}
			</div>

			<div className="flex items-center gap-2">
				{remaining !== null && (
					<span className="hidden text-xs text-muted-foreground sm:inline">
						{remaining <= 0 ? "No runs left today" : `${remaining} ${remaining === 1 ? "run" : "runs"} left today`}
					</span>
				)}
				{actions}
			</div>
		</footer>
	);
}

export function PromptSuggestions({ brandId, existingValues, tagOptions, onAdd, onClose }: PromptSuggestionsProps) {
	const { loading, error, suggestions, setSuggestions, remaining, requestRun, cancel } = useSuggestionRuns(
		brandId,
		existingValues,
	);

	// Same rules as pasting a list: duplicates are skipped and named, and going
	// over the cap blocks the add instead of quietly taking what fits.
	const picked = useMemo(() => suggestions.filter((s) => s.selected && s.value.trim()), [suggestions]);
	const preview = useMemo(
		() => parseBulkPrompts(picked.map((s) => s.value).join("\n"), { existing: existingValues, limit: MAX_PROMPTS }),
		[picked, existingValues],
	);
	const overCapacity = preview.skipped.overCapacity.length;
	const notice = picked.length > 0 ? describeSkipped(preview.skipped) : null;

	const allTagOptions = useMemo(
		() => [...new Set([...tagOptions, ...suggestions.flatMap((s) => s.tags)])].sort().map((value) => ({ value })),
		[tagOptions, suggestions],
	);

	const update = (key: string, patch: Partial<Suggestion>) =>
		setSuggestions((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
	const allSelected = suggestions.length > 0 && suggestions.every((s) => s.selected);

	const canRunAgain = !loading && !(remaining !== null && remaining <= 0) && error?.retryable !== false;

	const add = () => {
		if (preview.added.length === 0 || overCapacity > 0) return;
		const tagsByKey = new Map(picked.map((s) => [dedupeKey(s.value), s.tags]));
		onAdd(preview.added.map((value) => ({ value, tags: tagsByKey.get(dedupeKey(value)) ?? [] })));
		trackEvent("prompt_suggestions_added", { offered: suggestions.length, added: preview.added.length });
	};

	const close = () => {
		cancel();
		onClose();
	};

	return (
		<section
			aria-label="Suggested Prompts"
			className="overflow-hidden rounded-lg border bg-card shadow-sm animate-in fade-in slide-in-from-top-1"
		>
			<PanelHeader status={suggestions.length > 0 ? "picking" : loading ? "searching" : "idle"} onClose={close} />

			<ul className="divide-y">
				{suggestions.map((s) => (
					<SuggestionRow
						key={s.key}
						suggestion={s}
						tagOptions={allTagOptions}
						onChange={(patch) => update(s.key, patch)}
					/>
				))}
				{loading && <LoadingRows />}
			</ul>

			{!loading && !error && suggestions.length === 0 && (
				<p className="px-4 py-6 text-center text-sm text-muted-foreground">
					Nothing new this time. Everything suggested is already in your list.
				</p>
			)}

			{error && (
				<div
					role="alert"
					className="mx-4 my-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
				>
					<AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
					<span>{error.message}</span>
				</div>
			)}

			{/* Nothing to pick and nothing to retry (e.g. out of runs): the alert says it all. */}
			{(suggestions.length > 0 || canRunAgain || loading) && (
				<PanelFooter
					suggestions={suggestions}
					onToggleAll={() => setSuggestions((prev) => prev.map((s) => ({ ...s, selected: !allSelected })))}
					allSelected={allSelected}
					notice={notice}
					overCapacity={overCapacity}
					remaining={remaining}
					actions={
						<>
							<RunButton
								loading={loading}
								label={suggestions.length > 0 ? "Suggest More" : "Try Again"}
								disabled={!canRunAgain}
								onClick={requestRun}
							/>
							{suggestions.length > 0 && (
								<AddButton count={preview.added.length} disabled={overCapacity > 0} onClick={add} />
							)}
						</>
					}
				/>
			)}
		</section>
	);
}
