/**
 * Selection bar and the three bulk dialogs of the prompt catalog: status
 * (enable/disable), history delete, and tag removal.
 *
 * Each action is preview → confirm → commit. The preview comes from the
 * server for the exact ids (or tag) and the commit sends the same ids back;
 * the server re-checks brand, state and — for the delete — a digest of what
 * was previewed, so nothing here is a source of truth, only a display.
 */

import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Spinner } from "@workspace/ui/components/spinner";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useWriteErrorMessage } from "@/lib/write-errors";
import {
	BULK_STATUS_FAILED,
	commitBulkStatusFn,
	commitDeleteFn,
	commitTagRemovalFn,
	DELETE_FAILED,
	previewBulkStatusFn,
	previewDeleteFn,
	previewTagRemovalFn,
	TAG_REMOVAL_FAILED,
} from "@/server/prompt-bulk";
import type { BulkStatusPreview, DeletePreview, TagRemovalPreview } from "@/server/prompt-bulk-load";

const n = (v: number | string) => Number(v).toLocaleString("en-US");
const plural = (count: number, one: string, many = `${one}s`) => `${n(count)} ${count === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// Selection bar
// ---------------------------------------------------------------------------

export interface SelectionBarProps {
	selectedCount: number;
	/** Rows matching the current filter across every page. */
	matchingTotal: number;
	pageSize: number;
	selectionCap: number;
	onSelectAllMatching: () => Promise<void>;
	onClear: () => void;
	onEnable: () => void;
	onDisable: () => void;
	onDelete: () => void;
	disabledReason?: string;
}

export function SelectionBar({
	selectedCount,
	matchingTotal,
	pageSize,
	selectionCap,
	onSelectAllMatching,
	onClear,
	onEnable,
	onDisable,
	onDelete,
	disabledReason,
}: SelectionBarProps) {
	const [selectingAll, setSelectingAll] = useState(false);
	if (selectedCount === 0) return null;
	const canSelectAll = matchingTotal > selectedCount && matchingTotal > pageSize;
	const allTarget = Math.min(matchingTotal, selectionCap);
	return (
		<section
			className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
			data-testid="selection-bar"
			aria-label="Selected prompts"
		>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
				<span className="text-muted-foreground">
					<strong className="text-foreground" data-testid="selection-count">
						{n(selectedCount)}
					</strong>{" "}
					selected
				</span>
				{canSelectAll && (
					<Button
						type="button"
						size="sm"
						variant="link"
						disabled={selectingAll}
						className="h-auto p-0 cursor-pointer"
						onClick={async () => {
							setSelectingAll(true);
							try {
								await onSelectAllMatching();
							} finally {
								setSelectingAll(false);
							}
						}}
					>
						{selectingAll ? "Selecting…" : `Select all ${n(allTarget)} matching`}
					</Button>
				)}
				{matchingTotal > selectionCap && selectedCount >= selectionCap && (
					<span className="text-xs text-muted-foreground">Selection is capped at {n(selectionCap)}.</span>
				)}
			</div>
			<div className="flex flex-wrap items-center gap-2">
				{disabledReason && <span className="text-xs text-muted-foreground">{disabledReason}</span>}
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={!!disabledReason}
					onClick={onEnable}
					className="cursor-pointer"
				>
					Enable
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={!!disabledReason}
					onClick={onDisable}
					className="cursor-pointer"
				>
					Disable
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={!!disabledReason}
					onClick={onDelete}
					className="cursor-pointer text-destructive"
				>
					<Trash2 className="mr-1 size-3.5" /> Delete…
				</Button>
				<Button type="button" size="sm" variant="ghost" onClick={onClear} className="cursor-pointer">
					Clear selection
				</Button>
			</div>
		</section>
	);
}

// ---------------------------------------------------------------------------
// Shared dialog plumbing
// ---------------------------------------------------------------------------

type Phase = "loading" | "ready" | "committing";

function useAction<P>(
	open: boolean,
	load: () => Promise<P>,
	fallback: string,
): {
	preview: P | null;
	phase: Phase;
	error: string | null;
	setPhase: (p: Phase) => void;
	setError: (e: string | null) => void;
	reload: () => void;
} {
	const [preview, setPreview] = useState<P | null>(null);
	const [phase, setPhase] = useState<Phase>("loading");
	const [error, setError] = useState<string | null>(null);
	const writeError = useWriteErrorMessage();
	// The preview is fetched when the dialog opens (and on an explicit reload),
	// not whenever the caller re-renders with a fresh `load` closure.
	const loadRef = useRef(load);
	loadRef.current = load;
	const writeErrorRef = useRef(writeError);
	writeErrorRef.current = writeError;
	const run = useCallback(() => {
		let cancelled = false;
		setPhase("loading");
		setError(null);
		loadRef
			.current()
			.then((p) => {
				if (cancelled) return;
				setPreview(p);
				setPhase("ready");
			})
			.catch((err) => {
				if (cancelled) return;
				console.error("Bulk preview failed:", err);
				setError(writeErrorRef.current(err, fallback));
				setPhase("ready");
			});
		return () => {
			cancelled = true;
		};
	}, [fallback]);
	useEffect(() => {
		if (!open) {
			setPreview(null);
			setError(null);
			setPhase("loading");
			return;
		}
		return run();
	}, [open, run]);
	return {
		preview,
		phase,
		error,
		setPhase,
		setError,
		reload: () => {
			run();
		},
	};
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

function StatusPreview({ p, target }: { p: BulkStatusPreview; target: boolean }) {
	return (
		<ul className="space-y-1 text-sm" data-testid="bulk-status-preview">
			<li>
				<strong>{n(p.changing)}</strong> will be {target ? "enabled" : "disabled"}
				{p.alreadyInState > 0 && (
					<>
						; <strong>{n(p.alreadyInState)}</strong> already {target ? "enabled" : "disabled"} and left as is
					</>
				)}
				.
			</li>
			{p.unknown > 0 && (
				<li className="text-destructive">
					{plural(p.unknown, "selected prompt is", "selected prompts are")} not in this brand any more — the operation
					will be refused. Clear the selection and select again.
				</li>
			)}
			{target && p.chainsToStart > 0 && (
				<li>
					{plural(p.chainsToStart, "run chain")} will start, spread over the next {n(p.cadenceHours)} hours, and then
					run every {n(p.cadenceHours)} hours. Every run is a paid provider answer, and each answer may add a sentiment
					classification: expect the bill to grow with the number of enabled prompts. This is not an exact amount.
				</li>
			)}
			{!target && (p.queuedJobs > 0 || p.activeJobs > 0) && (
				<li>
					{plural(p.queuedJobs, "queued run")} will be cancelled
					{p.activeJobs > 0 && <>; {plural(p.activeJobs, "run")} already in progress will finish once and then stop</>}.
				</li>
			)}
		</ul>
	);
}

export function BulkStatusDialog({
	brandId,
	ids,
	enabled,
	open,
	onClose,
	onDone,
}: {
	brandId: string;
	ids: string[];
	enabled: boolean | null;
	open: boolean;
	onClose: () => void;
	onDone: (result: { changed: number }) => void;
}) {
	const target = enabled ?? false;
	const action = useAction<BulkStatusPreview>(
		open,
		() => previewBulkStatusFn({ data: { brandId, ids, enabled: target } }),
		BULK_STATUS_FAILED,
	);
	const writeError = useWriteErrorMessage();
	const p = action.preview;
	const verb = target ? "Enable" : "Disable";

	const commit = async () => {
		action.setPhase("committing");
		action.setError(null);
		try {
			const result = await commitBulkStatusFn({ data: { brandId, ids, enabled: target } });
			onDone(result);
		} catch (err) {
			console.error("Bulk status failed:", err);
			action.setError(writeError(err, BULK_STATUS_FAILED));
			action.setPhase("ready");
			action.reload();
		}
	};

	return (
		<Dialog open={open} onOpenChange={(o) => !o && action.phase !== "committing" && onClose()}>
			<DialogContent data-testid="bulk-status-dialog">
				<DialogHeader>
					<DialogTitle>
						{verb} {plural(ids.length, "prompt")}?
					</DialogTitle>
					<DialogDescription>
						{target
							? "Enabled prompts are tracked: each one starts a run chain on the brand cadence."
							: "Disabled prompts keep their text and history but stop running."}
					</DialogDescription>
				</DialogHeader>
				{action.phase === "loading" && (
					<p className="flex items-center gap-2 text-sm text-muted-foreground">
						<Spinner /> Checking the selection…
					</p>
				)}
				{p && <StatusPreview p={p} target={target} />}
				{action.error && (
					<p role="alert" className="text-sm text-destructive">
						{action.error}
					</p>
				)}
				<DialogFooter>
					<Button
						variant="outline"
						onClick={onClose}
						disabled={action.phase === "committing"}
						className="cursor-pointer"
					>
						Cancel
					</Button>
					<Button
						onClick={commit}
						disabled={action.phase !== "ready" || !p || p.unknown > 0}
						className="cursor-pointer"
						data-testid="bulk-status-commit"
					>
						{action.phase === "committing" ? (
							<>
								<Spinner /> Applying…
							</>
						) : p && p.changing === 0 ? (
							"Nothing to change"
						) : (
							`${verb} ${p ? n(p.changing) : ""}`
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function BulkDeleteDialog({
	brandId,
	ids,
	open,
	onClose,
	onDone,
}: {
	brandId: string;
	ids: string[];
	open: boolean;
	onClose: () => void;
	onDone: (result: { deleted: number }) => void;
}) {
	const action = useAction<DeletePreview>(open, () => previewDeleteFn({ data: { brandId, ids } }), DELETE_FAILED);
	const writeError = useWriteErrorMessage();
	const [phrase, setPhrase] = useState("");
	const phraseId = useId();
	useEffect(() => {
		if (!open) setPhrase("");
	}, [open]);
	const p = action.preview;
	const c = p?.counts;
	const blocked = !p || p.blockers.length > 0;
	const canCommit = action.phase === "ready" && !blocked && phrase === p.phrase;

	const commit = async () => {
		if (!p) return;
		action.setPhase("committing");
		action.setError(null);
		try {
			const result = await commitDeleteFn({ data: { brandId, ids, digest: p.digest, phrase } });
			onDone(result);
		} catch (err) {
			console.error("Bulk delete failed:", err);
			action.setError(writeError(err, DELETE_FAILED));
			setPhrase("");
			action.setPhase("ready");
			// Whatever refused it, the preview is the thing to look at again.
			action.reload();
		}
	};

	return (
		<Dialog open={open} onOpenChange={(o) => !o && action.phase !== "committing" && onClose()}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="bulk-delete-dialog">
				<DialogHeader>
					<DialogTitle>Delete {plural(ids.length, "prompt")} and their history?</DialogTitle>
					<DialogDescription>
						This cannot be undone. Every answer, citation and sentiment record of these prompts is removed, and the
						brand&apos;s history and analytics change accordingly. Billing records are kept.
					</DialogDescription>
				</DialogHeader>
				{action.phase === "loading" && (
					<p className="flex items-center gap-2 text-sm text-muted-foreground">
						<Spinner /> Counting what would be deleted…
					</p>
				)}
				{p && c && (
					<div className="space-y-3 text-sm" data-testid="bulk-delete-preview">
						{p.blockers.length > 0 && (
							<ul role="alert" className="list-disc space-y-1 pl-5 text-destructive">
								{p.blockers.map((b) => (
									<li key={b}>{b}</li>
								))}
							</ul>
						)}
						<dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
							<dt>Prompts</dt>
							<dd className="text-right font-medium">{n(c.prompts)}</dd>
							<dt>Answers (runs)</dt>
							<dd className="text-right">{n(c.promptRuns)}</dd>
							<dt>Citations</dt>
							<dd className="text-right">{n(c.citations)}</dd>
							<dt>Entity mentions</dt>
							<dd className="text-right">{n(c.entityMentions)}</dd>
							<dt>Sentiment detections / analyses</dt>
							<dd className="text-right">
								{n(c.sentimentDetections)} / {n(c.sentimentAnalyses)}
							</dd>
							<dt>Sentiment observations / aspects / filtered claims</dt>
							<dd className="text-right">
								{n(c.sentimentObservations)} / {n(c.sentimentAspectObservations)} / {n(c.sentimentFilteredClaims)}
							</dd>
							<dt>Sentiment review cases / permits</dt>
							<dd className="text-right">
								{n(c.sentimentResolutionCases)} / {n(c.sentimentDispatchPermits)}
							</dd>
							<dt>Sentiment provider attempts (recorded cost)</dt>
							<dd className="text-right">
								{n(c.sentimentProviderAttempts)} (${Number(c.sentimentAttemptCostUsd).toFixed(4)})
							</dd>
							<dt>Queued run jobs to cancel</dt>
							<dd className="text-right">{n(c.promptJobsQueued)}</dd>
							<dt className="text-muted-foreground">Kept: billing records (usage events)</dt>
							<dd className="text-right text-muted-foreground">{n(c.usageEventsKept)}</dd>
						</dl>
						{!blocked && (
							<div className="space-y-1">
								<label htmlFor={phraseId} className="text-sm">
									Type <code className="rounded bg-muted px-1">{p.phrase}</code> to confirm
								</label>
								<Input
									id={phraseId}
									value={phrase}
									onChange={(e) => setPhrase(e.target.value)}
									autoComplete="off"
									spellCheck={false}
									data-testid="bulk-delete-phrase"
								/>
							</div>
						)}
					</div>
				)}
				{action.error && (
					<p role="alert" className="text-sm text-destructive">
						{action.error}
					</p>
				)}
				<DialogFooter>
					<Button
						variant="outline"
						onClick={onClose}
						disabled={action.phase === "committing"}
						className="cursor-pointer"
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={commit}
						disabled={!canCommit}
						className="cursor-pointer"
						data-testid="bulk-delete-commit"
					>
						{action.phase === "committing" ? (
							<>
								<Spinner /> Deleting…
							</>
						) : (
							`Delete ${n(ids.length)} permanently`
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// Tag removal
// ---------------------------------------------------------------------------

export function TagRemovalDialog({
	brandId,
	tag,
	open,
	onClose,
	onDone,
}: {
	brandId: string;
	tag: string;
	open: boolean;
	onClose: () => void;
	onDone: (result: { tag: string; updated: number }) => void;
}) {
	const action = useAction<TagRemovalPreview>(
		open,
		() => previewTagRemovalFn({ data: { brandId, tag } }),
		TAG_REMOVAL_FAILED,
	);
	const writeError = useWriteErrorMessage();
	const [phrase, setPhrase] = useState("");
	const phraseId = useId();
	useEffect(() => {
		if (!open) setPhrase("");
	}, [open]);
	const p = action.preview;
	const canCommit = action.phase === "ready" && !!p && phrase === p.phrase;

	const commit = async () => {
		if (!p) return;
		action.setPhase("committing");
		action.setError(null);
		try {
			onDone(await commitTagRemovalFn({ data: { brandId, tag: p.tag, phrase } }));
		} catch (err) {
			console.error("Tag removal failed:", err);
			action.setError(writeError(err, TAG_REMOVAL_FAILED));
			action.setPhase("ready");
		}
	};

	return (
		<Dialog open={open} onOpenChange={(o) => !o && action.phase !== "committing" && onClose()}>
			<DialogContent data-testid="tag-removal-dialog">
				<DialogHeader>
					<DialogTitle>Remove the tag “{p?.tag ?? tag}” from every prompt?</DialogTitle>
					<DialogDescription>
						The tag is taken off every prompt of this brand. Prompts, their other tags, system tags and all history
						stay; analytics filtered by this tag will no longer find it.
					</DialogDescription>
				</DialogHeader>
				{action.phase === "loading" && (
					<p className="flex items-center gap-2 text-sm text-muted-foreground">
						<Spinner /> Counting prompts…
					</p>
				)}
				{p && (
					<div className="space-y-3 text-sm" data-testid="tag-removal-preview">
						<p>
							<strong>{plural(p.affectedPrompts, "prompt")}</strong> carr{p.affectedPrompts === 1 ? "ies" : "y"} the tag{" "}
							<code className="rounded bg-muted px-1">{p.tag}</code>.
						</p>
						<div className="space-y-1">
							<label htmlFor={phraseId} className="text-sm">
								Type <code className="rounded bg-muted px-1">{p.phrase}</code> to confirm
							</label>
							<Input
								id={phraseId}
								value={phrase}
								onChange={(e) => setPhrase(e.target.value)}
								autoComplete="off"
								spellCheck={false}
								data-testid="tag-removal-phrase"
							/>
						</div>
					</div>
				)}
				{action.error && (
					<p role="alert" className="text-sm text-destructive">
						{action.error}
					</p>
				)}
				<DialogFooter>
					<Button
						variant="outline"
						onClick={onClose}
						disabled={action.phase === "committing"}
						className="cursor-pointer"
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={commit}
						disabled={!canCommit}
						className="cursor-pointer"
						data-testid="tag-removal-commit"
					>
						{action.phase === "committing" ? (
							<>
								<Spinner /> Removing…
							</>
						) : (
							"Remove tag"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
