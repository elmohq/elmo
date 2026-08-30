import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { normalizeSlug, ORG_URL_PREFIX } from "@workspace/lib/app-urls";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import { SlugField } from "@/components/slug-field";
import { useOrganization, useOrganizationsChanged } from "@/hooks/use-organizations";
import { pageHead } from "@/lib/route-head";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { updateOrganizationFn } from "@/server/organizations";

export const Route = createFileRoute("/_authed/app/org/$org/settings/")({
	head: pageHead({ title: "Organization", description: "The organization's name and URL." }),
	component: OrganizationSettingsPage,
});

function OrganizationSettingsPage() {
	const organization = useOrganization();
	const organizationsChanged = useOrganizationsChanged();
	const navigate = useNavigate();
	const writeError = useWriteErrorMessage();
	const [name, setName] = useState(organization.name);
	const [slug, setSlug] = useState(organization.slug);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const trimmedName = name.trim();
	const trimmedSlug = normalizeSlug(slug);
	const slugMoved = trimmedSlug !== organization.slug;
	const isDirty = name !== organization.name || slug !== organization.slug;
	const isComplete = trimmedName.length > 0 && trimmedSlug.length > 0;

	async function handleSave(e: React.FormEvent) {
		e.preventDefault();
		if (!isDirty || !isComplete) return;
		setError(null);
		setSaving(true);
		try {
			await updateOrganizationFn({
				data: { organizationId: organization.id, name: trimmedName, ...(slugMoved && { slug: trimmedSlug }) },
			});
			setName(trimmedName);
			setSlug(trimmedSlug);
			await organizationsChanged(
				slugMoved
					? () => navigate({ to: "/app/org/$org/settings", params: { org: trimmedSlug }, replace: true })
					: undefined,
			);
		} catch (err) {
			setError(writeError(err, "Failed to save the organization."));
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="max-w-2xl space-y-6">
			<h1 className="text-3xl font-bold">Organization</h1>

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

				{error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>}

				<Button type="submit" disabled={saving || !isDirty || !isComplete}>
					{saving ? "Saving..." : "Save"}
				</Button>
			</form>
		</div>
	);
}
