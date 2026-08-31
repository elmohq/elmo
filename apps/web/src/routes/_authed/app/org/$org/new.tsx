import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import FullPageCard from "@/components/full-page-card";
import { PlatformSelectionStep } from "@/components/platform-selection-step";
import { useOrganizationsChanged } from "@/hooks/use-organizations";
import { useOrganizationParams } from "@/hooks/use-route-params";
import { validateWebsiteUrl } from "@/lib/brand-website";
import { trackEvent } from "@/lib/posthog";
import { pageHead } from "@/lib/route-head";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { createBrandInOrgFn } from "@/server/brands";
import { getOnboardingPlatformStateFn, type OnboardingPlatformState } from "@/server/platform-picks";

export const Route = createFileRoute("/_authed/app/org/$org/new")({
	staticData: { crumb: "New brand" },
	loader: ({ context }) => {
		const { brandCreation, name, id } = context.organization;
		if (brandCreation.kind === "not-offered") {
			throw redirect({ to: "/app/org/$org", params: { org: context.organization.slug } });
		}
		return {
			organizationId: id,
			organizationName: name,
			blocked: brandCreation.kind === "denied" ? brandCreation : null,
		};
	},
	head: pageHead({ description: "Start tracking a new brand in this organization." }),
	component: NewBrandPage,
});

function NewBrandPage() {
	const { organizationId, organizationName, blocked } = Route.useLoaderData();
	const organizationParams = useOrganizationParams();
	const [step, setStep] = useState<"details" | "platforms">("details");
	const [details, setDetails] = useState({ brandName: "", website: "" });
	const [platformState, setPlatformState] = useState<NonNullable<OnboardingPlatformState> | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const organizationsChanged = useOrganizationsChanged();
	const navigate = useNavigate();
	const writeError = useWriteErrorMessage();

	const createBrand = async (brandName: string, website: string, enabledModels: string[] | null) => {
		setIsLoading(true);
		setError("");

		try {
			const { brandSlug } = await createBrandInOrgFn({
				data: {
					brandName,
					website,
					organizationId,
					...(enabledModels && enabledModels.length > 0 && { enabledModels }),
				},
			});
			trackEvent("brand_created", { has_website: Boolean(website) });

			await organizationsChanged(() =>
				navigate({ to: "/app/org/$org/brand/$brand", params: { ...organizationParams, brand: brandSlug } }),
			);
		} catch (err) {
			setError(writeError(err, "Could not create the brand."));
		} finally {
			setIsLoading(false);
		}
	};

	const handleDetailsSubmit = async (formData: FormData) => {
		const brandName = (formData.get("brandName") as string)?.trim() ?? "";
		const website = (formData.get("website") as string)?.trim() ?? "";
		setError("");

		const validation = validateWebsiteUrl(website);
		if (!validation.isValid) {
			setError(validation.error);
			return;
		}

		setIsLoading(true);
		try {
			const state = await getOnboardingPlatformStateFn({ data: { organizationId } });
			if (!state) {
				await createBrand(brandName, website, null);
				return;
			}
			setDetails({ brandName, website });
			setPlatformState(state);
			setSelected(new Set(state.defaultSelected));
			setStep("platforms");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not read this organization's platforms.");
		} finally {
			setIsLoading(false);
		}
	};

	if (blocked) {
		return (
			<FullPageCard
				title={
					blocked.code === "no-active-plan" ? "This organization has no plan" : "You've used every brand on your plan"
				}
				subtitle={blocked.message}
				showBackButton
			>
				<Link
					to="/app/org/$org/settings/billing"
					params={organizationParams}
					className={buttonVariants({ className: "w-full" })}
				>
					Go to billing
				</Link>
			</FullPageCard>
		);
	}

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
		<FullPageCard title="Create a new brand" subtitle={`Start tracking a brand in ${organizationName}`} showBackButton>
			<form action={handleDetailsSubmit} className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="brandName">Brand Name</Label>
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

				{error && <p className="text-sm text-destructive">{error}</p>}

				<Button type="submit" className="w-full" disabled={isLoading}>
					{isLoading ? "Creating..." : "Continue"}
				</Button>
			</form>
		</FullPageCard>
	);
}
