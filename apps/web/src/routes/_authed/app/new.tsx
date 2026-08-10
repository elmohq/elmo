/**
 * /app/new - Create a new brand.
 *
 * Attaches a new brand to one of the current user's organizations and seeds
 * the brand row with the supplied name + website. Gated by the
 * canCreateBrands deployment feature (local, cloud) at both the loader
 * (redirect to /app) and the server function.
 *
 * Where the plan meters platforms, a second step asks which ones to track:
 * this is the flow every cloud brand goes through, so accepting the defaults
 * silently would mean a brand's first cycle runs on platforms nobody chose.
 */

import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { useState } from "react";
import FullPageCard from "@/components/full-page-card";
import { PlatformSelectionStep } from "@/components/platform-selection-step";
import { listUserOrganizations, requireAuthSession } from "@/lib/auth/helpers";
import { validateWebsiteUrl } from "@/lib/brand-website";
import { getDeployment } from "@/lib/config/server";
import { trackEvent } from "@/lib/posthog";
import { createBrandInOrgFn } from "@/server/brands";
import { getOnboardingPlatformStateFn, type OnboardingPlatformState } from "@/server/platform-picks";

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
	const [step, setStep] = useState<"details" | "platforms">("details");
	const [details, setDetails] = useState({ brandName: "", website: "" });
	const [platformState, setPlatformState] = useState<NonNullable<OnboardingPlatformState> | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
	const navigate = useNavigate();
	const router = useRouter();

	const createBrand = async (brandName: string, website: string, enabledModels: string[] | null) => {
		setIsLoading(true);
		setError("");

		try {
			const { brandId } = await createBrandInOrgFn({
				data: {
					brandName,
					website,
					organizationId: organizationId || undefined,
					...(enabledModels && enabledModels.length > 0 && { enabledModels }),
				},
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

	const handleDetailsSubmit = async (formData: FormData) => {
		const brandName = (formData.get("brandName") as string)?.trim() ?? "";
		const website = (formData.get("website") as string)?.trim() ?? "";
		setError("");

		// Checked before the platform step rather than after it, so a typo in the
		// URL doesn't cost the user their platform picks.
		const validation = validateWebsiteUrl(website);
		if (!validation.isValid) {
			setError(validation.error);
			return;
		}

		setIsLoading(true);
		try {
			const state = organizationId ? await getOnboardingPlatformStateFn({ data: { organizationId } }) : null;
			if (!state) {
				await createBrand(brandName, website, null);
				return;
			}
			setDetails({ brandName, website });
			setPlatformState(state);
			setSelected(new Set(state.defaultSelected));
			setStep("platforms");
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setIsLoading(false);
		}
	};

	if (step === "platforms" && platformState) {
		return (
			<FullPageCard title={`Create ${details.brandName}`} subtitle="Choose which AI platforms to track">
				<PlatformSelectionStep
					state={platformState}
					selected={selected}
					onSelectedChange={setSelected}
					disabled={isLoading}
					error={error}
					onBack={() => setStep("details")}
					onSubmit={() => createBrand(details.brandName, details.website, [...selected])}
					submitLabel={isLoading ? "Creating..." : "Create brand"}
				/>
			</FullPageCard>
		);
	}

	return (
		<FullPageCard title="Create a new brand" subtitle="Set up a brand to start tracking" showBackButton>
			<form action={handleDetailsSubmit} className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="brandName">Brand name</Label>
					<Input
						id="brandName"
						name="brandName"
						type="text"
						placeholder="Acme"
						required
						disabled={isLoading}
						defaultValue={details.brandName}
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="website">Website</Label>
					<Input
						id="website"
						name="website"
						type="text"
						placeholder="example.com"
						required
						disabled={isLoading}
						defaultValue={details.website}
					/>
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
					{isLoading ? "Creating..." : "Continue"}
				</Button>
			</form>
		</FullPageCard>
	);
}
