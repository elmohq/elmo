import { IconArrowRight } from "@tabler/icons-react";
import { cloudSignupUrl } from "@workspace/config/referrals";
import { buttonVariants } from "@workspace/ui/components/button";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";

const SIGNUP_URL = cloudSignupUrl("demo-header");

export function DemoSignupCta() {
	if (!useDeploymentFeatures()?.promotesCloud) return null;

	return (
		<a href={SIGNUP_URL} target="_blank" rel="noopener" className={buttonVariants({ size: "sm" })}>
			Track Your Brand
			<IconArrowRight />
		</a>
	);
}
