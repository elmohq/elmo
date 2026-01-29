import { redirect } from "next/navigation";
import { getElmoOrgs } from "@/lib/metadata";
import { serverConfig } from "@/lib/config/server";
import FullPageCard from "@/components/full-page-card";
import { BrandSwitcher } from "@workspace/whitelabel/components/brand-switcher";

export default async function BrandSwitcherPage() {
	const config = serverConfig;
	
	// Check if multi-org brand switching is supported (only whitelabel mode)
	if (config.features.supportsMultiOrg) {
		// Force refresh to always get the latest org memberships from Auth0
		// This ensures users see updated organizations immediately when visiting this page
		const orgs = await getElmoOrgs({ forceRefresh: true });

		return (
			<FullPageCard title="Brand Switcher" subtitle="Select a brand to get started">
				<BrandSwitcher organizations={orgs} />
			</FullPageCard>
		);
	} else {
		// Single org mode (local/demo) - redirect to the default organization
		const defaultOrgId = config.defaultOrganization?.id;
		if (!defaultOrgId) {
			throw new Error("DEFAULT_ORG_ID is not configured for this deployment.");
		}
		redirect(`/app/${defaultOrgId}`);
	}	
}
