/**
 * Save bar for pages that buffer edits locally until an explicit save.
 *
 * It surfaces only once there's something to lose, then stays pinned to the
 * bottom of the viewport so it's reachable from anywhere in a long list. It
 * also guards the three ways those edits can vanish: in-app navigation,
 * browser back/forward, and closing the tab.
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
import { Loader2, Save } from "lucide-react";
import * as m from "@/paraglide/messages.js";

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
			{isDirty && (
				<div className="sticky bottom-4 z-10 animate-in fade-in slide-in-from-bottom-2">
					{/* The bar floats over the list, so the base layer stays opaque and
					    the dirty tint is layered on top of it. */}
					<div className="rounded-lg border border-amber-500/40 bg-background shadow-lg">
						<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg bg-amber-500/10 px-4 py-3">
							<div className="flex items-center gap-2.5 text-sm">
								<span className="relative flex h-2 w-2 shrink-0">
									<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
									<span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
								</span>
								<span className="font-medium text-amber-700 dark:text-amber-400">{m.unsaved_title()}</span>
								{summary && <span className="text-muted-foreground">{summary}</span>}
							</div>

							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={isSaving}
									onClick={() => setConfirmingDiscard(true)}
									className="cursor-pointer"
								>
									{m.common_discard()}
								</Button>
								<Button
									type="button"
									size="sm"
									disabled={isSaving}
									onClick={onSave}
									className="flex items-center gap-2 cursor-pointer"
								>
									{isSaving ? (
										<>
											<Loader2 className="h-4 w-4 animate-spin" /> {m.common_saving()}
										</>
									) : (
										<>
											<Save className="h-4 w-4" /> {m.common_save_changes()}
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
			)}

			<Dialog open={confirmingDiscard} onOpenChange={setConfirmingDiscard}>
				<DialogContent closeLabel={m.common_close()}>
					<DialogHeader>
						<DialogTitle>{m.unsaved_discard_title()}</DialogTitle>
						<DialogDescription>
							{summary ? m.unsaved_discard_summary({ summary }) : m.unsaved_discard_generic()}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setConfirmingDiscard(false)} className="cursor-pointer">
							{m.common_keep_editing()}
						</Button>
						<Button
							variant="destructive"
							onClick={() => {
								setConfirmingDiscard(false);
								onDiscard();
							}}
							className="cursor-pointer"
						>
							{m.unsaved_discard_title()}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={blocker.status === "blocked"} onOpenChange={(open) => !open && blocker.reset?.()}>
				<DialogContent closeLabel={m.common_close()}>
					<DialogHeader>
						<DialogTitle>{m.unsaved_leave_title()}</DialogTitle>
						<DialogDescription>
							{summary ? m.unsaved_leave_summary({ summary }) : m.unsaved_leave_generic()}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => blocker.reset?.()} className="cursor-pointer">
							{m.unsaved_stay()}
						</Button>
						<Button variant="destructive" onClick={() => blocker.proceed?.()} className="cursor-pointer">
							{m.unsaved_leave()}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
