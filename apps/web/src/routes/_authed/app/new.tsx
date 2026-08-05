/**
 * /app/new - Create a new brand.
 *
 * Attaches the brand to an existing workspace and seeds its name and website.
 * Whitelabel and demo are blocked at both the loader and server-function
 * policy boundaries.
 */
import { useState } from "react";
import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import FullPageCard from "@/components/full-page-card";
import { trackEvent } from "@/lib/posthog";
import { listUserOrganizations, requireAuthSession } from "@/lib/auth/helpers";
import { createBrandInOrgFn } from "@/server/brands";
import { getDeployment } from "@/lib/config/server";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";

const getNewBrandOptions = createServerFn({ method: "GET" }).handler(
	async (): Promise<{ canCreateBrands: boolean; organizations: { id: string; name: string }[] }> => {
		if (!getDeployment().features.canCreateBrands) return { canCreateBrands: false, organizations: [] };
		const session = await requireAuthSession();
		return { canCreateBrands: true, organizations: await listUserOrganizations(session.user.id) };
	},
);

export const Route = createFileRoute("/_authed/app/new")({
	loader: async () => {
		const { canCreateBrands, organizations } = await getNewBrandOptions();
		if (!canCreateBrands) {
			throw redirect({ to: "/app" });
		}
		return { organizations };
	},
	component: NewBrandPage,
});

function NewBrandPage() {
	const { organizations } = Route.useLoaderData();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
	const navigate = useNavigate();
	const router = useRouter();

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

				{organizations.length > 1 && (
					<div className="space-y-2">
						<Label htmlFor="organization">Workspace</Label>
						<Select value={organizationId} onValueChange={setOrganizationId} disabled={isLoading}>
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
