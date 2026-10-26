import { cloudSignupUrl } from "@workspace/config/referrals";
import { READ_ONLY_REFUSED } from "@/lib/read-only-errors";

const SIGNUP_URL = cloudSignupUrl("demo-read-only");

/**
 * A failed save, as useWriteErrorMessage worded it. A demo visitor trying to
 * edit is a visitor wanting their own brand in here, so the refusal points
 * them at a workspace where they can.
 */
export function WriteErrorMessage({ message }: { message: string }) {
	if (message !== READ_ONLY_REFUSED) return <>{message}</>;

	return (
		<>
			The demo is read-only —{" "}
			<a href={SIGNUP_URL} target="_blank" rel="noopener" className="font-medium underline underline-offset-4">
				start your own workspace
			</a>{" "}
			to track your brand.
		</>
	);
}
