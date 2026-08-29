/**
 * An organization isn't a page you look at, so this leads to what you can change
 * about it. `/app` is where you pick one.
 *
 * The exception is an organization Auth0 filled but nobody has set up, which gets
 * the wizard — with the brand taking the organization's own id, as it always has.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import BrandOnboarding from "@/components/brand-onboarding";
import { needsSetup } from "@/lib/organizations/tree";
import type { OrganizationSummary } from "@/lib/organizations/types";
import { getOnboardingPlatformStateFn, type OnboardingPlatformState } from "@/server/platform-picks";

export const Route = createFileRoute("/_authed/app/org/$org/")({
	loader: async ({
		context,
	}): Promise<{ organization: OrganizationSummary; onboardingPlatformState: OnboardingPlatformState }> => {
		if (!needsSetup(context.organization)) {
			throw redirect({ to: "/app/org/$org/settings", params: { org: context.organization.slug } });
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
			organizationSlug={organization.slug}
			brandId={organization.id}
			brandName={organization.name}
			platformState={onboardingPlatformState}
		/>
	);
}
