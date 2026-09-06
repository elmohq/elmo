import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import FullPageCard from "@/components/full-page-card";
import { useOrganizationsChanged } from "@/hooks/use-organizations";
import { pageHead } from "@/lib/route-head";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { createOrganizationFn } from "@/server/organizations";

export const Route = createFileRoute("/_authed/app/new")({
	staticData: { crumb: "New organization" },
	beforeLoad: ({ context }) => {
		if (!context.clientConfig?.features.canCreateOrganizations) {
			throw redirect({ to: "/app" });
		}
	},
	head: pageHead({
		title: "New organization",
		description: "Create an organization to hold its own brands, team, and plan.",
	}),
	component: NewOrganizationPage,
});

function NewOrganizationPage() {
	const organizationsChanged = useOrganizationsChanged();
	const navigate = useNavigate();
	const writeError = useWriteErrorMessage();
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
			await organizationsChanged(() => navigate({ to: "/app/org/$org/settings", params: { org: slug } }));
		} catch (err) {
			setError(writeError(err, "Could not create the organization."));
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
