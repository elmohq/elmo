/**
 * An admin action, and only where this deployment owns the record: a whitelabel
 * organization belongs to Auth0 and demo writes nothing. The fields stay live
 * there and the save is what refuses, so the reason is on screen rather than
 * left to be guessed from a dead form.
 */
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ORG_URL_PREFIX } from "@workspace/lib/app-urls";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import { SlugField } from "@/components/slug-field";
import { useInvalidateOrganizations, useOrganization } from "@/hooks/use-organizations";
import { pageHead } from "@/lib/route-head";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { updateOrganizationFn } from "@/server/organizations";

export const Route = createFileRoute("/_authed/app/org/$org/settings/")({
	head: pageHead({ title: "Organization", description: "The organization's name and URL." }),
	component: OrganizationSettingsPage,
});

function OrganizationSettingsPage() {
	const organization = useOrganization();
	const router = useRouter();
	const invalidateOrganizations = useInvalidateOrganizations();
	const writeError = useWriteErrorMessage();
	const [name, setName] = useState(organization.name);
	const [slug, setSlug] = useState(organization.slug);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Compared raw so the button stays live long enough to normalize padding the
	// server would have trimmed anyway.
	const trimmedName = name.trim();
	const trimmedSlug = slug.trim().toLowerCase();
	const slugMoved = trimmedSlug !== organization.slug;
	const isDirty = name !== organization.name || slug !== organization.slug;
	const isComplete = trimmedName.length > 0 && trimmedSlug.length > 0;

	async function handleSave(e: React.FormEvent) {
		e.preventDefault();
		// Enter submits whatever the button is doing, and spaces clear `required`.
		if (!isDirty || !isComplete) return;
		setError(null);
		setSaving(true);
		try {
			await updateOrganizationFn({
				data: { org: organization.slug, name: trimmedName, ...(slugMoved && { slug: trimmedSlug }) },
			});
			setName(trimmedName);
			setSlug(trimmedSlug);
			await invalidateOrganizations();
			// If the slug moved, so did the address this page is at.
			if (slugMoved) {
				await router.navigate({ to: "/app/org/$org/settings", params: { org: trimmedSlug }, replace: true });
			}
			await router.invalidate();
		} catch (err) {
			setError(writeError(err, "Failed to save the organization."));
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="max-w-2xl space-y-6">
			<h1 className="text-3xl font-bold">Organization</h1>

			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<form onSubmit={handleSave} className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="organization-name">Organization Name</Label>
					<Input
						id="organization-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						required
						className="w-72"
					/>
				</div>

				<SlugField
					id="organization-slug"
					label="Organization Slug"
					prefix={ORG_URL_PREFIX}
					value={slug}
					onChange={setSlug}
					className="w-72"
				/>

				<Button type="submit" disabled={saving || !isDirty || !isComplete}>
					{saving ? "Saving..." : "Save"}
				</Button>
			</form>
		</div>
	);
}
