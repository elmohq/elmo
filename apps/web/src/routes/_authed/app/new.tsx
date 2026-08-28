/**
 * /app/new — Create a workspace.
 *
 * Cloud only: local has one workspace per install, whitelabel's arrive from
 * Auth0, and demo writes nothing. The redirect here is UX; the write refuses on
 * its own.
 *
 * A new workspace has no plan, so it opens on its own settings rather than a
 * dashboard — there is nothing in it yet, and billing is the first thing it
 * needs before a brand can go in.
 */

import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import FullPageCard from "@/components/full-page-card";
import { useInvalidateWorkspaces } from "@/hooks/use-workspaces";
import { buildTitle, getAppName } from "@/lib/route-head";
import { createWorkspaceFn } from "@/server/workspaces";

export const Route = createFileRoute("/_authed/app/new")({
	staticData: { crumb: "New workspace" },
	beforeLoad: ({ context }) => {
		if (!context.clientConfig?.features.canCreateWorkspaces) {
			throw redirect({ to: "/app" });
		}
	},
	head: ({ match }) => ({
		meta: [
			{ title: buildTitle("New workspace", { appName: getAppName(match) }) },
			{ name: "description", content: "Create a workspace to hold its own brands, team, and plan." },
		],
	}),
	component: NewWorkspacePage,
});

function NewWorkspacePage() {
	const navigate = useNavigate();
	const router = useRouter();
	const invalidateWorkspaces = useInvalidateWorkspaces();
	const [name, setName] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");

	const trimmed = name.trim();

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (trimmed.length === 0) return;
		setError("");
		setIsLoading(true);
		try {
			const { slug } = await createWorkspaceFn({ data: { name: trimmed } });
			await Promise.all([invalidateWorkspaces(), router.invalidate()]);
			await navigate({ to: "/app/org/$org/settings", params: { org: slug } });
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
			setIsLoading(false);
		}
	}

	return (
		<FullPageCard
			title="Create a workspace"
			subtitle="A workspace holds its own brands, team, and plan."
			showBackButton
		>
			<form onSubmit={handleSubmit} className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="workspace-name">Name</Label>
					<Input
						id="workspace-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Acme"
						required
						disabled={isLoading}
					/>
				</div>

				{error && <p className="text-sm text-destructive">{error}</p>}

				<Button type="submit" className="w-full" disabled={isLoading || trimmed.length === 0}>
					{isLoading ? "Creating..." : "Create workspace"}
				</Button>
			</form>
		</FullPageCard>
	);
}
