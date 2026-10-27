import { IconArrowRight } from "@tabler/icons-react";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { cloudSignupUrl } from "@workspace/config/referrals";
import { useDeploymentMode } from "@/hooks/use-deployment-features";

const SIGNUP_URL = cloudSignupUrl("demo-banner");

export function DemoSignupBanner() {
	const mode = useDeploymentMode();
	if (mode !== "demo") return null;

	return (
		<div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-900 dark:text-amber-100">
			<span>
				<span className="hidden sm:inline">You're viewing a live demo tracking Elmo's own brand. </span>
				<span className="sm:hidden">This is a live demo. </span>
				Track yours from ${CLOUD_ENTRY_PRICE_USD}/mo.
			</span>
			<a
				href={SIGNUP_URL}
				target="_blank"
				rel="noopener"
				className="inline-flex items-center gap-1 font-medium underline underline-offset-4 hover:no-underline"
			>
				Start with Elmo Cloud
				<IconArrowRight className="size-3.5" aria-hidden />
			</a>
		</div>
	);
}
