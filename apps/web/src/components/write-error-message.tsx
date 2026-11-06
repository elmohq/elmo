import { cloudSignupUrl } from "@workspace/config/referrals";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";
import { READ_ONLY_REFUSED } from "@/lib/read-only-errors";

const SIGNUP_URL = cloudSignupUrl("demo-read-only");

export function WriteErrorMessage({ message }: { message: string }) {
	const promotesCloud = useDeploymentFeatures()?.promotesCloud;
	if (message !== READ_ONLY_REFUSED || !promotesCloud) return <>{message}</>;

	return (
		<span>
			The demo is read-only. Track your own brand with{" "}
			<a href={SIGNUP_URL} target="_blank" rel="noopener" className="font-medium underline underline-offset-4">
				Elmo Cloud
			</a>
			.
		</span>
	);
}
