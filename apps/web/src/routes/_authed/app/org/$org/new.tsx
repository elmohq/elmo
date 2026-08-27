/**
 * /app/org/$org/new - Create a new brand in this workspace.
 *
 * The URL says which workspace the brand joins, so the page never has to ask —
 * and the answer, which decides who can see the brand and who is billed for it,
 * is the one the user navigated from. Gated by the canCreateBrands deployment
 * feature (local, cloud) at both the loader and the server function.
 *
 * Where the plan meters platforms, a second step asks which ones to track:
 * this is the flow every cloud brand goes through, so accepting the defaults
 * silently would mean a brand's first cycle runs on platforms nobody chose.
 *
 * A workspace that has spent its plan's brands is told so here, before anything
 * is filled in — the write guard would otherwise reject the finished form, and
 * a limit is not something to discover at the end of a wizard.
 */

import { createFileRoute, Link, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { checkBrandCreate, type EntitlementDenialCode } from "@workspace/lib/entitlements";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import { z } from "zod";
import FullPageCard from "@/components/full-page-card";
import { PlatformSelectionStep } from "@/components/platform-selection-step";
import { requireAuthSession, requireOrganization } from "@/lib/auth/helpers";
import { validateWebsiteUrl } from "@/lib/brand-website";
import { getDeployment } from "@/lib/config/server";
import { trackEvent } from "@/lib/posthog";
import { buildTitle, getAppName } from "@/lib/route-head";
import { createBrandInOrgFn } from "@/server/brands";
import { getOnboardingPlatformStateFn, type OnboardingPlatformState } from "@/server/platform-picks";

interface NewBrandOptions {
	canCreateBrands: boolean;
	organizationId: string;
	workspaceName: string;
	/** Why this workspace can't take another brand; null when it can. */
	blocked: { code: EntitlementDenialCode; message: string } | null;
}

const getNewBrandOptions = createServerFn({ method: "GET" })
	.validator(z.object({ org: z.string() }))
	.handler(async ({ data }): Promise<NewBrandOptions> => {
		const session = await requireAuthSession();
		const workspace = await requireOrganization(session.user.id, data.org);

		if (!getDeployment().features.canCreateBrands) {
			return { canCreateBrands: false, organizationId: workspace.id, workspaceName: workspace.name, blocked: null };
		}

		const decision = (await checkBrandCreate([workspace.id])).get(workspace.id);

		return {
			canCreateBrands: true,
			organizationId: workspace.id,
			workspaceName: workspace.name,
			blocked: decision && !decision.allowed ? { code: decision.code, message: decision.message } : null,
		};
	});

export const Route = createFileRoute("/_authed/app/org/$org/new")({
	loader: async ({ params }): Promise<NewBrandOptions> => {
		const options = await getNewBrandOptions({ data: { org: params.org } });
		if (!options.canCreateBrands) {
			throw redirect({ to: "/app/org/$org", params: { org: params.org } });
		}
		return options;
	},
	head: ({ match }) => ({
		meta: [{ title: buildTitle("New brand", { appName: getAppName(match) }) }],
	}),
	component: NewBrandPage,
});

function NewBrandPage() {
	const { organizationId, workspaceName, blocked } = Route.useLoaderData();
	const { org } = Route.useParams();
	const [step, setStep] = useState<"details" | "platforms">("details");
	const [details, setDetails] = useState({ brandName: "", website: "" });
	const [platformState, setPlatformState] = useState<NonNullable<OnboardingPlatformState> | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const navigate = useNavigate();
	const router = useRouter();

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

			await router.invalidate();
			// The brand arrives with a slug, so land on it rather than on the id and
			// a redirect.
			await navigate({ to: "/app/org/$org/brand/$brand", params: { org, brand: brandSlug } });
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
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setIsLoading(false);
		}
	};

	if (blocked) {
		return (
			<FullPageCard
				title={
					blocked.code === "no-active-plan" ? "This workspace has no plan" : "You've used every brand on your plan"
				}
				subtitle={blocked.message}
				showBackButton
			>
				<Button asChild className="w-full">
					<Link to="/app/org/$org/settings/billing" params={{ org }}>
						Go to billing
					</Link>
				</Button>
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
		<FullPageCard title="Create a new brand" subtitle={`Start tracking a brand in ${workspaceName}`} showBackButton>
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

				{error && <p className="text-sm text-destructive">{error}</p>}

				<Button type="submit" className="w-full" disabled={isLoading}>
					{isLoading ? "Creating..." : "Continue"}
				</Button>
			</form>
		</FullPageCard>
	);
}
