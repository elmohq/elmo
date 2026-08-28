/**
 * The redirect is UX; `createOrganizationFn` refuses on its own. A new organization
 * has no plan, so it opens on its own settings — billing is the first thing it
 * needs before a brand can go in.
 */

import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import FullPageCard from "@/components/full-page-card";
import { useInvalidateOrganizations } from "@/hooks/use-organizations";
import { buildTitle, getAppName } from "@/lib/route-head";
import { createOrganizationFn } from "@/server/organizations";

export const Route = createFileRoute("/_authed/app/new")({
	staticData: { crumb: "New organization" },
	beforeLoad: ({ context }) => {
		if (!context.clientConfig?.features.canCreateOrganizations) {
			throw redirect({ to: "/app" });
		}
	},
	head: ({ match }) => ({
		meta: [
			{ title: buildTitle("New organization", { appName: getAppName(match) }) },
			{ name: "description", content: "Create an organization to hold its own brands, team, and plan." },
		],
	}),
	component: NewOrganizationPage,
});

function NewOrganizationPage() {
	const navigate = useNavigate();
	const router = useRouter();
	const invalidateOrganizations = useInvalidateOrganizations();
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
			const { slug } = await createOrganizationFn({ data: { name: trimmed } });
			await Promise.all([invalidateOrganizations(), router.invalidate()]);
			await navigate({ to: "/app/org/$org/settings", params: { org: slug } });
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
			setIsLoading(false);
		}
	}

	return (
		<FullPageCard
			title="Create an organization"
			subtitle="An organization holds its own brands, team, and plan."
			showBackButton
		>
			<form onSubmit={handleSubmit} className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="organization-name">Organization Name</Label>
					<Input
						id="organization-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Acme"
						required
						disabled={isLoading}
					/>
				</div>

				{error && <p className="text-sm text-destructive">{error}</p>}

				<Button type="submit" className="w-full" disabled={isLoading || trimmed.length === 0}>
					{isLoading ? "Creating..." : "Create organization"}
				</Button>
			</form>
		</FullPageCard>
	);
}
