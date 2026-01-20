import { redirect } from "next/navigation";
import { getElmoOrgs } from "@/lib/metadata";
import { getDeploymentConfig } from "@/lib/config";
import FullPageCard from "@/components/full-page-card";
import { BrandSwitcher } from "@workspace/whitelabel/components/brand-switcher";

export default async function BrandSwitcherPage() {
	const config = getDeploymentConfig();
	
	if (config.mode === "whitelabel") {
		const orgs = await getElmoOrgs();

		return (
			<FullPageCard title="Brand Switcher" subtitle="Select a brand to get started">
				<BrandSwitcher organizations={orgs} />
			</FullPageCard>
		);
	} else {
		const defaultOrgId = config.defaultOrganization?.id;
		if (!defaultOrgId) {
			throw new Error("DEFAULT_ORG_ID is not configured for this deployment.");
		}
		redirect(`/app/${defaultOrgId}`);
	}	
}
