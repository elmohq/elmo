/**
 * Bulk import for the prompt catalog: paste `prompt text;tag1;tag2` lines,
 * Review, then Commit.
 *
 * Nothing is parsed while typing. Review sends the text to the server, which
 * answers with totals and a bounded set of examples — never the lines back —
 * plus a token naming exactly what it reviewed. Commit sends the same text
 * and token; the server re-checks both against the live catalog and writes
 * everything or nothing. The textarea keeps its text through every failure.
 */

import { describeMissingPrompt, type PromptImportSummary } from "@workspace/lib/bulk-prompts";
import { MAX_PROMPTS } from "@workspace/lib/constants";
import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { ListPlus } from "lucide-react";
import { useId, useState } from "react";
import { isPublicError } from "@/lib/public-errors";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { commitPromptImportFn, PROMPT_IMPORT_FAILED, reviewPromptImportFn } from "@/server/prompt-import";
import type { PromptImportReview } from "@/server/prompt-import-load";

const REVIEW_FAILED = "The review failed. Your text is still here — try again.";

function formatCount(n: number): string {
	return n.toLocaleString("en-US");
}

function plural(n: number, one: string, many = `${one}s`): string {
	return `${formatCount(n)} ${n === 1 ? one : many}`;
}

interface PromptImportPanelProps {
	brandId: string;
	/** Why committing is not possible right now, e.g. unsaved edits on the page. */
	blockedReason?: string;
	onImported: (result: { inserted: number; enabled: boolean }) => void;
}

export function PromptImportPanel({ brandId, blockedReason, onImported }: PromptImportPanelProps) {
	const [open, setOpen] = useState(false);
	const [text, setText] = useState("");
	const [enabled, setEnabled] = useState(false);
	const [review, setReview] = useState<PromptImportReview | null>(null);
	const [busy, setBusy] = useState<"review" | "commit" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const writeError = useWriteErrorMessage();
	const helpId = useId();
	const statusGroupId = useId();

	const invalidateReview = () => setReview(null);

	const runReview = async () => {
		setBusy("review");
		setError(null);
		setStatus(null);
		try {
			setReview(await reviewPromptImportFn({ data: { brandId, text, enabled } }));
		} catch (err) {
			console.error("Prompt import review failed:", err);
			setError(writeError(err, REVIEW_FAILED));
		} finally {
			setBusy(null);
		}
	};

	const runCommit = async () => {
		if (!review) return;
		setBusy("commit");
		setError(null);
		try {
			const result = await commitPromptImportFn({ data: { brandId, text, enabled, token: review.token } });
			setStatus(`Imported ${plural(result.inserted, "prompt")} as ${result.enabled ? "enabled" : "disabled"}.`);
			setText("");
			setReview(null);
			setOpen(false);
			onImported(result);
		} catch (err) {
			console.error("Prompt import failed:", err);
			setError(writeError(err, PROMPT_IMPORT_FAILED));
			// A stale review must be redone against the catalog as it is now.
			if (isPublicError(err) && err.code === "import-review-stale") setReview(null);
		} finally {
			setBusy(null);
		}
	};

	const blocking = review ? describeBlocking(review.summary) : null;
	const canCommit = review !== null && review.summary.added > 0 && blocking === null && !blockedReason && busy === null;

	return (
		<>
			<Button
				variant="outline"
				size="sm"
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				className="flex items-center gap-2 cursor-pointer"
			>
				<ListPlus className="h-4 w-4" /> Import prompts
			</Button>
			{status && !open && (
				<span role="status" className="text-sm text-muted-foreground">
					{status}
				</span>
			)}

			{open && (
				<div className="basis-full space-y-3 rounded-md border bg-muted/40 p-3" data-testid="prompt-import-panel">
					<Textarea
						value={text}
						onChange={(e) => {
							setText(e.target.value);
							invalidateReview();
						}}
						placeholder={"One prompt per line, optional tags after a semicolon:\nPrompt text;tag1;tag2"}
						rows={8}
						spellCheck={false}
						aria-label="Prompts to import, one per line, with optional tags separated by semicolons"
						aria-describedby={helpId}
					/>
					<p id={helpId} className="text-xs text-muted-foreground">
						One prompt per line, up to {formatCount(MAX_PROMPTS)} lines. To tag a prompt, write its tags after it
						separated by semicolons, for example <code className="rounded bg-muted px-1">Prompt text;tag1;tag2</code>.
						Semicolons separate fields and cannot be part of a prompt or tag. Review shows what will be added before
						anything is written.
					</p>

					<fieldset className="flex flex-wrap items-center gap-4 text-sm" aria-describedby={statusGroupId}>
						<legend className="sr-only">Status for imported prompts</legend>
						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								name="import-status"
								checked={!enabled}
								onChange={() => {
									setEnabled(false);
									invalidateReview();
								}}
							/>
							Add as disabled
						</label>
						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								name="import-status"
								checked={enabled}
								onChange={() => {
									setEnabled(true);
									invalidateReview();
								}}
							/>
							Add as enabled
						</label>
						<span id={statusGroupId} className="text-xs text-muted-foreground">
							Disabled prompts are stored but not tracked; enabled prompts start running on the brand cadence.
						</span>
					</fieldset>

					<div className="flex flex-wrap items-center gap-2">
						<Button
							size="sm"
							type="button"
							variant={review ? "outline" : "default"}
							onClick={runReview}
							disabled={text.trim().length === 0 || busy !== null}
							className="cursor-pointer"
						>
							{busy === "review" ? "Reviewing…" : "Review"}
						</Button>
						<Button size="sm" type="button" onClick={runCommit} disabled={!canCommit} className="cursor-pointer">
							{busy === "commit"
								? "Importing…"
								: review && review.summary.added > 0
									? `Import ${plural(review.summary.added, "prompt")}`
									: "Import"}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							type="button"
							onClick={() => {
								setOpen(false);
								setError(null);
							}}
							className="cursor-pointer"
						>
							Cancel
						</Button>
					</div>

					{review && <ReviewSummary review={review} blocking={blocking} />}
					{review && blockedReason && !blocking && <p className="text-xs text-muted-foreground">{blockedReason}</p>}
					{error && (
						<p role="alert" className="text-sm text-destructive">
							{error}
						</p>
					)}
				</div>
			)}
		</>
	);
}

/** The reasons a reviewed import cannot be committed, or null. Mirrors the paste's own rules. */
function describeBlocking(summary: PromptImportSummary): string | null {
	const missing = describeMissingPrompt(summary.samples.missingPrompt);
	if (missing) {
		return summary.missingPrompt > summary.samples.missingPrompt.length
			? `${missing} (${formatCount(summary.missingPrompt)} such lines in total; the first ${formatCount(summary.samples.missingPrompt.length)} are listed.)`
			: missing;
	}
	if (summary.overCapacity > 0) {
		return `This import is ${plural(summary.overCapacity, "prompt")} over the ${formatCount(MAX_PROMPTS)} limit. Remove ${summary.overCapacity === 1 ? "a line" : "some lines"} to continue.`;
	}
	return null;
}

function ReviewSummary({ review, blocking }: { review: PromptImportReview; blocking: string | null }) {
	const { summary } = review;
	const skipped: { label: string; examples?: string[] }[] = [];
	if (summary.blank > 0) skipped.push({ label: plural(summary.blank, "blank line") });
	if (summary.duplicateOfExisting > 0) {
		skipped.push({
			label: `${plural(summary.duplicateOfExisting, "duplicate")} of prompts already in the list`,
			examples: summary.samples.duplicateOfExisting,
		});
	}
	if (summary.duplicateInPaste > 0) {
		skipped.push({
			label: `${plural(summary.duplicateInPaste, "line")} repeated within the paste`,
			examples: summary.samples.duplicateInPaste,
		});
	}

	return (
		<div className="space-y-2 text-sm" role="status" data-testid="prompt-import-review">
			<p>
				<strong>{plural(summary.added, "prompt")}</strong> will be added as{" "}
				<strong>{review.enabled ? "enabled" : "disabled"}</strong> out of {plural(summary.lines, "line")}. The brand
				holds {formatCount(review.brandTotal)} prompts and has room for {formatCount(review.room)} more.
			</p>
			{skipped.length > 0 && (
				<ul className="list-disc space-y-1 pl-5 text-muted-foreground">
					{skipped.map((item) => (
						<li key={item.label}>
							Skipped {item.label}
							{item.examples && item.examples.length > 0 && (
								<>
									{" "}
									— for example{" "}
									{item.examples
										.slice(0, 3)
										.map((example) => `“${example}”`)
										.join(", ")}
									{item.examples.length > 3 && "…"}
								</>
							)}
							. Tags on a skipped line are not merged.
						</li>
					))}
				</ul>
			)}
			{blocking && (
				<p role="alert" className="text-destructive">
					{blocking}
				</p>
			)}
		</div>
	);
}
