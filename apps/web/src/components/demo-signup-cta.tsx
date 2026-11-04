import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { cloudSignupUrl } from "@workspace/config/referrals";
import { buttonVariants } from "@workspace/ui/components/button";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";

const SIGNUP_URL = cloudSignupUrl("demo-header");

export function DemoSignupCta() {
	if (!useDeploymentFeatures()?.promotesCloud) return null;

	return (
		<div className="flex items-center gap-3">
			<span className="hidden text-sm text-muted-foreground lg:inline">
				This is a live demo. Track yours from ${CLOUD_ENTRY_PRICE_USD}/mo.
			</span>
			<a href={SIGNUP_URL} target="_blank" rel="noopener" className={buttonVariants({ size: "sm" })}>
				Start with Elmo Cloud
			</a>
		</div>
	);
}
