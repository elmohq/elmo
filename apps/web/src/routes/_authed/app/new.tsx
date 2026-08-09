/**
 * /app/new - Create a new brand.
 *
 * Attaches a new brand to one of the current user's organizations and seeds
 * the brand row with the supplied name + website. Gated by the
 * canCreateBrands deployment feature (local, cloud) at both the loader
 * (redirect to /app) and the server function.
 */
import { useState } from "react";
import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import FullPageCard from "@/components/full-page-card";
import { listUserOrganizations, requireAuthSession } from "@/lib/auth/helpers";
import { trackEvent } from "@/lib/posthog";
import { createBrandInOrgFn } from "@/server/brands";
import { getDeployment } from "@/lib/config/server";

const getNewBrandOptions = createServerFn({ method: "GET" }).handler(
	async (): Promise<{ canCreateBrands: boolean; organizations: { id: string; name: string }[] }> => {
		if (!getDeployment().features.canCreateBrands) {
			return { canCreateBrands: false, organizations: [] };
		}
		const session = await requireAuthSession();
		return { canCreateBrands: true, organizations: await listUserOrganizations(session.user.id) };
	},
);

export const Route = createFileRoute("/_authed/app/new")({
	loader: async (): Promise<{ organizations: { id: string; name: string }[] }> => {
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

				<div className="space-y-2">
					<Label htmlFor="website">Website</Label>
					<Input id="website" name="website" type="text" placeholder="example.com" required disabled={isLoading} />
				</div>

				{/* One workspace is the norm; only ask when the answer isn't already decided. */}
				{organizations.length > 1 && (
					<div className="space-y-2">
						<Label htmlFor="organization">Workspace</Label>
						<Select value={organizationId} onValueChange={setOrganizationId} disabled={isLoading}>
							<SelectTrigger id="organization" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{organizations.map((org) => (
									<SelectItem key={org.id} value={org.id}>
										{org.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}

				{error && <p className="text-sm text-destructive">{error}</p>}

				<Button type="submit" className="w-full" disabled={isLoading}>
					{isLoading ? "Creating..." : "Create brand"}
				</Button>
			</form>
		</FullPageCard>
	);
}
