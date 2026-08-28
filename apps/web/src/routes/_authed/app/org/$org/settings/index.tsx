/**
 * An admin action, and only where this deployment owns the record: a whitelabel
 * organization belongs to Auth0 and demo writes nothing. There the fields are
 * read-only rather than hidden — the page still has to say which organization this
 * is.
 */
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ORG_URL_PREFIX } from "@workspace/lib/app-urls";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import { SlugField } from "@/components/slug-field";
import { useInvalidateOrganizations, useOrganizationRoute } from "@/hooks/use-organizations";
import { buildTitle, getAppName } from "@/lib/route-head";
import {
	getOrganizationPermissionsFn,
	type OrganizationPermissions,
	updateOrganizationFn,
} from "@/server/organizations";

export const Route = createFileRoute("/_authed/app/org/$org/settings/")({
	loader: ({ params }): Promise<OrganizationPermissions> => getOrganizationPermissionsFn({ data: { org: params.org } }),
	head: ({ match }) => ({
		meta: [
			{ title: buildTitle("Organization", { appName: getAppName(match) }) },
			{ name: "description", content: "The organization's name and URL." },
		],
	}),
	component: OrganizationSettingsPage,
});

function OrganizationSettingsPage() {
	const { organization } = useOrganizationRoute();
	const { canRename } = Route.useLoaderData();
	const router = useRouter();
	const invalidateOrganizations = useInvalidateOrganizations();
	const [name, setName] = useState(organization.name);
	const [slug, setSlug] = useState(organization.slug);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Compared raw so the button stays live long enough to normalize padding the
	// server would have trimmed anyway.
	const trimmedName = name.trim();
	const trimmedSlug = slug.trim().toLowerCase();
	const isDirty = name !== organization.name || slug !== organization.slug;
	const isComplete = trimmedName.length > 0 && trimmedSlug.length > 0;

	async function handleSave(e: React.FormEvent) {
		e.preventDefault();
		// Enter submits whatever the button is doing, and spaces clear `required`.
		if (!isDirty || !isComplete) return;
		setError(null);
		setSaving(true);
		try {
			await updateOrganizationFn({ data: { org: organization.slug, name: trimmedName, slug: trimmedSlug } });
			setName(trimmedName);
			setSlug(trimmedSlug);
			// If the slug moved, so did the address this page is at.
			await invalidateOrganizations();
			await router.navigate({
				to: "/app/org/$org/settings",
				params: { org: trimmedSlug },
				replace: true,
			});
			await router.invalidate();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save the organization");
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
						disabled={!canRename}
						className="w-72"
					/>
				</div>

				<SlugField
					id="organization-slug"
					label="Organization Slug"
					prefix={ORG_URL_PREFIX}
					value={slug}
					onChange={setSlug}
					disabled={!canRename}
					className="w-72"
				/>

				{canRename && (
					<Button type="submit" disabled={saving || !isDirty || !isComplete}>
						{saving ? "Saving..." : "Save"}
					</Button>
				)}
			</form>
		</div>
	);
}
