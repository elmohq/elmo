/**
 * /app/org/$org/settings — what the workspace is, and what it holds.
 *
 * The workspace is the thing brands, members, and the subscription all hang
 * off, so this is where its name and its URL are stated plainly. Both are an
 * admin action, and only where this deployment owns the record: a whitelabel
 * workspace belongs to Auth0 and demo writes nothing. In every other case the
 * fields are shown read-only rather than hidden — the point of the page is to
 * say which workspace this is.
 *
 * The workspace itself and the brands it owns come from the layout above; the
 * only thing asked for here is what that doesn't carry.
 */
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { WORKSPACE_URL_PREFIX } from "@workspace/lib/app-urls";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import { SlugField } from "@/components/slug-field";
import { useInvalidateWorkspaces, useWorkspaceRoute } from "@/hooks/use-workspaces";
import { buildTitle, getAppName } from "@/lib/route-head";
import {
	getWorkspaceSettingsFn,
	renameWorkspaceFn,
	setWorkspaceSlugFn,
	type WorkspaceSettings,
} from "@/server/workspaces";

export const Route = createFileRoute("/_authed/app/org/$org/settings/")({
	loader: ({ params }): Promise<WorkspaceSettings> => getWorkspaceSettingsFn({ data: { org: params.org } }),
	head: ({ match }) => ({
		meta: [
			{ title: buildTitle("Workspace", { appName: getAppName(match) }) },
			{ name: "description", content: "Workspace name, URL, and what it contains." },
		],
	}),
	component: WorkspaceSettingsPage,
});

function WorkspaceSettingsPage() {
	const { workspace } = useWorkspaceRoute();
	const { memberCount, canRename } = Route.useLoaderData();
	const router = useRouter();
	const invalidateWorkspaces = useInvalidateWorkspaces();
	const [name, setName] = useState(workspace.name);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const brandCount = workspace.brands.length;

	// The stored name is the trimmed one, so saving " Acme " leaves the field
	// showing something the server never kept. Comparing the raw value is what
	// keeps the button live long enough to normalize it, and adopting the trimmed
	// value afterwards is what settles the field instead of leaving it dirty.
	const trimmed = name.trim();
	const isDirty = name !== workspace.name;

	/** The name is on the rail and in the switcher, so both go with the route data. */
	async function refresh() {
		await invalidateWorkspaces();
		await router.invalidate();
	}

	async function handleSave(e: React.FormEvent) {
		e.preventDefault();
		// Enter submits the form whatever the button is doing, and a name of only
		// spaces would clear `required` on its way to a server-side rejection.
		if (!isDirty || trimmed.length === 0) return;
		setError(null);
		setSaving(true);
		try {
			await renameWorkspaceFn({ data: { org: workspace.slug, name: trimmed } });
			setName(trimmed);
			await refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to rename the workspace");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="max-w-2xl space-y-6">
			<div>
				<h1 className="text-3xl font-bold">Workspace</h1>
				<p className="text-muted-foreground">
					You're in <span className="font-medium text-foreground">{workspace.name}</span>. Brands, members, and billing
					all belong to it.
				</p>
			</div>

			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<form onSubmit={handleSave} className="flex flex-wrap items-end gap-3">
				<div className="flex flex-col gap-2">
					<Label htmlFor="workspace-name">Name</Label>
					<Input
						id="workspace-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						required
						disabled={!canRename}
						className="w-72"
					/>
				</div>
				{canRename && (
					<Button type="submit" disabled={saving || !isDirty || trimmed.length === 0}>
						{saving ? "Saving..." : "Save"}
					</Button>
				)}
			</form>

			<SlugField
				id="workspace-url"
				prefix={WORKSPACE_URL_PREFIX}
				current={workspace.slug}
				subject="workspace"
				canEdit={canRename}
				save={(slug) => setWorkspaceSlugFn({ data: { org: workspace.slug, slug } })}
				// The URL every link into this workspace uses just moved, including
				// the one in the address bar.
				onSaved={async (slug) => {
					await invalidateWorkspaces();
					await router.navigate({ to: "/app/org/$org/settings", params: { org: slug }, replace: true });
				}}
			/>

			<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
				<Badge variant="secondary">{workspace.role}</Badge>
				<span>
					{brandCount} {brandCount === 1 ? "brand" : "brands"} · {memberCount}{" "}
					{memberCount === 1 ? "member" : "members"}
				</span>
			</div>
		</div>
	);
}
