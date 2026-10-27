import { useLocation } from "@tanstack/react-router";
import { cloudAppUrl } from "@workspace/config/referrals";
import { ArrowRight, X } from "lucide-react";
import { useAiReferral } from "@/lib/ai-referral";

const CLOUD_URL = cloudAppUrl("marketing-ai-referral");

export function AiReferralBanner() {
	const pathname = useLocation({ select: (location) => location.pathname });
	const [referral, setReferral] = useAiReferral();

	if (!referral || referral.dismissed || pathname === "/") return null;

	return (
		<div className="relative border-b border-zinc-200 bg-zinc-50 text-sm text-zinc-900">
			<div className="mx-auto flex max-w-6xl items-center justify-center px-10 py-2 text-center">
				<p>
					{referral.assistant} sent you here. Want it to recommend you too?{" "}
					<a
						href={CLOUD_URL}
						className="inline-flex items-center gap-1 whitespace-nowrap font-medium underline underline-offset-4"
					>
						Get started
						<ArrowRight className="size-3.5" aria-hidden="true" />
					</a>
				</p>
			</div>
			<button
				type="button"
				onClick={() => setReferral({ ...referral, dismissed: true })}
				aria-label="Dismiss"
				className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-zinc-500 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-blue-600"
			>
				<X className="size-4" aria-hidden="true" />
			</button>
		</div>
	);
}
