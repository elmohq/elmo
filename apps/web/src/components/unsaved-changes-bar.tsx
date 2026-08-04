/**
 * Sticky save bar for pages that buffer edits locally until an explicit save.
 *
 * It stays pinned to the bottom of the viewport so the save affordance and the
 * dirty state are reachable from anywhere in a long list, and it guards the
 * three ways a user can lose buffered edits: in-app navigation, browser
 * back/forward, and closing the tab.
 */
import { useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { cn } from "@workspace/ui/lib/utils";
import { Check, Loader2, Save } from "lucide-react";

interface UnsavedChangesBarProps {
	isDirty: boolean;
	isSaving: boolean;
	/** Breakdown of what changed, e.g. "2 added · 1 edited". */
	summary?: string;
	/** Message from the last failed save. */
	error?: string | null;
	onSave: () => void;
	onDiscard: () => void;
}

export function UnsavedChangesBar({ isDirty, isSaving, summary, error, onSave, onDiscard }: UnsavedChangesBarProps) {
	const [confirmingDiscard, setConfirmingDiscard] = useState(false);

	// A save is in flight until the parent resets its baseline, so keep blocking
	// through it — the edits aren't durable yet.
	const blocker = useBlocker({
		shouldBlockFn: () => isDirty,
		enableBeforeUnload: () => isDirty,
		withResolver: true,
	});

	return (
		<>
			{/* The bar floats over the list, so the base layer stays opaque and the
			    dirty tint is layered on top of it. */}
			<div className="sticky bottom-4 z-10">
				<div className={cn("rounded-lg border bg-background shadow-lg", isDirty && "border-amber-500/40")}>
					<div
						className={cn(
							"flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg px-4 py-3",
							isDirty && "bg-amber-500/10",
						)}
					>
						<div className="flex items-center gap-2.5 text-sm">
							{isDirty ? (
								<>
									<span className="relative flex h-2 w-2 shrink-0">
										<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
										<span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
									</span>
									<span className="font-medium text-amber-700 dark:text-amber-400">Unsaved changes</span>
									{summary && <span className="text-muted-foreground">{summary}</span>}
								</>
							) : (
								<>
									<Check className="h-4 w-4 shrink-0 text-muted-foreground" />
									<span className="text-muted-foreground">All changes saved</span>
								</>
							)}
						</div>

						<div className="flex items-center gap-2">
							{isDirty && (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={isSaving}
									onClick={() => setConfirmingDiscard(true)}
									className="cursor-pointer"
								>
									Discard
								</Button>
							)}
							<Button
								type="button"
								size="sm"
								disabled={!isDirty || isSaving}
								onClick={onSave}
								className="flex items-center gap-2 cursor-pointer"
							>
								{isSaving ? (
									<>
										<Loader2 className="h-4 w-4 animate-spin" /> Saving…
									</>
								) : (
									<>
										<Save className="h-4 w-4" /> Save changes
									</>
								)}
							</Button>
						</div>

						{error && (
							<p className="w-full text-sm text-destructive" role="alert">
								{error}
							</p>
						)}
					</div>
				</div>
			</div>

			<Dialog open={confirmingDiscard} onOpenChange={setConfirmingDiscard}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Discard changes?</DialogTitle>
						<DialogDescription>
							{summary ? `${summary} will be reverted.` : "Your changes will be reverted."} This can&apos;t be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setConfirmingDiscard(false)} className="cursor-pointer">
							Keep editing
						</Button>
						<Button
							variant="destructive"
							onClick={() => {
								setConfirmingDiscard(false);
								onDiscard();
							}}
							className="cursor-pointer"
						>
							Discard changes
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={blocker.status === "blocked"} onOpenChange={(open) => !open && blocker.reset?.()}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Leave without saving?</DialogTitle>
						<DialogDescription>
							{summary ? `You have unsaved changes (${summary}).` : "You have unsaved changes."} They&apos;ll be lost if
							you leave this page.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => blocker.reset?.()} className="cursor-pointer">
							Stay on page
						</Button>
						<Button variant="destructive" onClick={() => blocker.proceed?.()} className="cursor-pointer">
							Leave without saving
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
