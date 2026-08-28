import { MAX_SLUG_LENGTH } from "@workspace/lib/app-urls";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import { type SlugResult, slugErrorMessage } from "@/lib/slugs";

/**
 * The URL segment something is reachable at, edited on its own.
 *
 * Saved apart from whatever form it sits in, because changing it moves the page
 * the form is on: `onSaved` is handed the slug that stuck so the caller can
 * navigate to the new address rather than leave the browser on one that no
 * longer resolves.
 *
 * A refused slug is reported under the field, so the caller's `save` returns a
 * `SlugResult` instead of throwing for the ordinary cases.
 */
export function SlugField({
	id,
	prefix,
	current,
	subject,
	canEdit = true,
	save,
	onSaved,
}: {
	id: string;
	/** The part of the URL before the segment, shown so the whole address reads. */
	prefix: string;
	current: string;
	/** What breaks if this changes — "workspace", "brand". */
	subject: string;
	canEdit?: boolean;
	save: (slug: string) => Promise<SlugResult>;
	onSaved: (slug: string) => Promise<unknown> | unknown;
}) {
	const [value, setValue] = useState(current);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const next = value.trim().toLowerCase();
	const isDirty = next !== current;

	async function handleSave(e: React.FormEvent) {
		e.preventDefault();
		if (!isDirty || next.length === 0) return;
		setError(null);
		setSaving(true);
		try {
			const result = await save(next);
			if (!result.ok) {
				setError(slugErrorMessage(result.error));
				return;
			}
			await onSaved(result.slug);
		} catch (err) {
			setError(err instanceof Error ? err.message : `Failed to change the ${subject} URL`);
		} finally {
			setSaving(false);
		}
	}

	return (
		<form onSubmit={handleSave} className="space-y-2">
			<Label htmlFor={id}>URL</Label>
			<div className="flex flex-wrap items-center gap-3">
				<div className="flex items-center rounded-md border font-mono text-sm">
					<span className="pl-3 text-muted-foreground">{prefix}</span>
					<Input
						id={id}
						value={value}
						onChange={(e) => setValue(e.target.value)}
						readOnly={!canEdit}
						maxLength={MAX_SLUG_LENGTH}
						className="w-52 border-0 pl-0 font-mono text-sm shadow-none focus-visible:ring-0"
					/>
				</div>
				{canEdit && (
					<Button type="submit" variant="outline" disabled={saving || !isDirty || next.length === 0}>
						{saving ? "Saving..." : "Change URL"}
					</Button>
				)}
			</div>
			{error ? (
				<p className="text-sm text-destructive">{error}</p>
			) : (
				<p className="text-sm text-muted-foreground">
					Changing this breaks existing links to this {subject}, including any bookmarks.
				</p>
			)}
		</form>
	);
}
