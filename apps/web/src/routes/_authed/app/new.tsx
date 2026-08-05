/**
 * /app/new - Create a new brand.
 *
 * Attaches the brand to an existing workspace and seeds its name and website.
 * Whitelabel and demo are blocked at both the loader and server-function
 * policy boundaries.
 */

import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { useState } from "react";
import { z } from "zod";
import FullPageCard from "@/components/full-page-card";
import { listUserOrganizations, requireAuthSession } from "@/lib/auth/helpers";
import { cloudBillingPath, isProjectedCloudSubscriptionActive, resolveNewBrandWorkspace } from "@/lib/cloud-billing-ui";
import { getDeployment } from "@/lib/config/server";
import { trackEvent } from "@/lib/posthog";
import { createBrandInOrgFn } from "@/server/brands";
import { getWorkspaceBillingFn } from "@/server/cloud-billing";

const getNewBrandOptions = createServerFn({ method: "GET" }).handler(
	async (): Promise<{
		canCreateBrands: boolean;
		mode: ReturnType<typeof getDeployment>["mode"];
		organizations: { id: string; name: string }[];
	}> => {
		const deployment = getDeployment();
		if (!deployment.features.canCreateBrands) {
			return { canCreateBrands: false, mode: deployment.mode, organizations: [] };
		}
		const session = await requireAuthSession();
		return {
			canCreateBrands: true,
			mode: deployment.mode,
			organizations: await listUserOrganizations(session.user.id),
		};
	},
);

export const Route = createFileRoute("/_authed/app/new")({
	validateSearch: z.object({ organization: z.string().optional() }),
	loaderDeps: ({ search }) => ({ organization: search.organization }),
	loader: async ({ deps }) => {
		const { canCreateBrands, mode, organizations } = await getNewBrandOptions();
		if (!canCreateBrands) {
			throw redirect({ to: "/app" });
		}

		let activeCloudOrganizationIds: Set<string> | undefined;
		const candidateOrganizationId =
			deps.organization ?? (organizations.length === 1 ? organizations[0]?.id : undefined);
		if (
			mode === "cloud" &&
			candidateOrganizationId &&
			organizations.some((org) => org.id === candidateOrganizationId)
		) {
			const billing = await getWorkspaceBillingFn({ data: { organizationId: candidateOrganizationId } });
			activeCloudOrganizationIds = isProjectedCloudSubscriptionActive(billing.subscription)
				? new Set([candidateOrganizationId])
				: new Set();
		}
		const decision = resolveNewBrandWorkspace({
			mode,
			organizationIds: organizations.map((organization) => organization.id),
			requestedOrganizationId: deps.organization,
			activeCloudOrganizationIds,
		});
		if (decision.kind === "billing") {
			const returnTo = `/app/new?organization=${encodeURIComponent(decision.organizationId)}`;
			throw redirect({ href: cloudBillingPath(decision.organizationId, { returnTo }) });
		}
		return {
			organizations,
			isCloud: mode === "cloud",
			requiresWorkspaceChoice: decision.kind === "choose-workspace",
			organizationId: "organizationId" in decision ? decision.organizationId : null,
		};
	},
	component: NewBrandPage,
});

function NewBrandPage() {
	const {
		organizations,
		isCloud,
		requiresWorkspaceChoice,
		organizationId: loadedOrganizationId,
	} = Route.useLoaderData();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const [organizationId, setOrganizationId] = useState(loadedOrganizationId ?? "");
	const navigate = useNavigate();
	const router = useRouter();

	if (requiresWorkspaceChoice) {
		return (
			<FullPageCard title="Choose a workspace" subtitle="Select which workspace will own the new brand" showBackButton>
				<div className="space-y-4">
					<Select value={organizationId} onValueChange={setOrganizationId}>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Choose a workspace" />
						</SelectTrigger>
						<SelectContent>
							{organizations.map((organization) => (
								<SelectItem key={organization.id} value={organization.id}>
									{organization.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						className="w-full"
						disabled={!organizationId}
						onClick={() => navigate({ to: "/app/new", search: { organization: organizationId } })}
					>
						Continue
					</Button>
				</div>
			</FullPageCard>
		);
	}

	const handleSubmit = async (formData: FormData) => {
		setIsLoading(true);
		setError("");

		try {
			const brandName = (formData.get("brandName") as string)?.trim() ?? "";
			const website = (formData.get("website") as string)?.trim() ?? "";

			const { brandId } = await createBrandInOrgFn({
				data: { brandName, website, organizationId: organizationId || undefined },
			});
			trackEvent("brand_created", { has_website: Boolean(website) });

			await router.invalidate();
			await navigate({ to: "/app/$brand", params: { brand: brandId } });
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<FullPageCard title="Create a new brand" subtitle="Set up a brand to start tracking" showBackButton>
			<form action={handleSubmit} className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="brandName">Brand name</Label>
					<Input id="brandName" name="brandName" type="text" placeholder="Acme" required disabled={isLoading} />
				</div>

				{isCloud && organizations.length > 1 && (
					<div className="space-y-2">
						<Label htmlFor="organization">Workspace</Label>
						<Select
							value={organizationId}
							onValueChange={(value) => {
								if (isCloud) navigate({ to: "/app/new", search: { organization: value } });
								else setOrganizationId(value);
							}}
							disabled={isLoading}
						>
							<SelectTrigger id="organization" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{organizations.map((organization) => (
									<SelectItem key={organization.id} value={organization.id}>
										{organization.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}

				<div className="space-y-2">
					<Label htmlFor="website">Website</Label>
					<Input id="website" name="website" type="text" placeholder="example.com" required disabled={isLoading} />
				</div>

				{error && <p className="text-sm text-destructive">{error}</p>}

				<Button type="submit" className="w-full" disabled={isLoading}>
					{isLoading ? "Creating..." : "Create brand"}
				</Button>
			</form>
		</FullPageCard>
	);
}
