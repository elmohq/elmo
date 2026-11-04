import { IconArrowRight } from "@tabler/icons-react";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { cloudSignupUrl } from "@workspace/config/referrals";
import { buttonVariants } from "@workspace/ui/components/button";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";
import { READ_ONLY_REFUSED } from "@/lib/read-only-errors";

const SIGNUP_URL = cloudSignupUrl("demo-read-only");

export function WriteErrorMessage({ message }: { message: string }) {
	const promotesCloud = useDeploymentFeatures()?.promotesCloud;
	if (message !== READ_ONLY_REFUSED || !promotesCloud) return <>{message}</>;

	return (
		<span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
			<span>The demo is read-only. Track your own brand from ${CLOUD_ENTRY_PRICE_USD}/mo.</span>
			<a href={SIGNUP_URL} target="_blank" rel="noopener" className={buttonVariants({ size: "sm" })}>
				Start with Elmo Cloud
				<IconArrowRight aria-hidden />
			</a>
		</span>
	);
}
