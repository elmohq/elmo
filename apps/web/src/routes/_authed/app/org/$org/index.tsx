/**
 * An organization isn't a page you look at, so this leads to what you can change
 * about it. `/app` is where you pick one.
 *
 * The exception is an organization Auth0 filled but nobody has set up, which gets
 * the wizard — with the brand taking the organization's own id, as it always has.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { orgSegment } from "@workspace/lib/app-urls";
import BrandOnboarding from "@/components/brand-onboarding";
import type { OrganizationSummary } from "@/lib/organizations/types";
import { getOnboardingPlatformStateFn, type OnboardingPlatformState } from "@/server/platform-picks";

/**
 * `brandLimit` separates "this deployment doesn't create brands" from "the plan
 * says not right now": the second is waiting on billing, not on setup, and the
 * wizard would be a dead end for it.
 */
function needsOnboarding(organization: OrganizationSummary): boolean {
	return organization.brands.length === 0 && !organization.canCreateBrand && !organization.brandLimit;
}

export const Route = createFileRoute("/_authed/app/org/$org/")({
	loader: async ({
		context,
	}): Promise<{ organization: OrganizationSummary; onboardingPlatformState: OnboardingPlatformState }> => {
		if (!needsOnboarding(context.organization)) {
			throw redirect({ to: "/app/org/$org/settings", params: { org: orgSegment(context.organization) } });
		}

		return {
			organization: context.organization,
			onboardingPlatformState: await getOnboardingPlatformStateFn({
				data: { organizationId: context.organization.id },
			}),
		};
	},
	component: OrganizationOnboardingPage,
});

function OrganizationOnboardingPage() {
	const { organization, onboardingPlatformState } = Route.useLoaderData();

	return (
		<BrandOnboarding
			organizationSlug={orgSegment(organization)}
			brandId={organization.id}
			brandName={organization.name}
			platformState={onboardingPlatformState}
		/>
	);
}
