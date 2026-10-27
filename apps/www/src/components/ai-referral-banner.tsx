import { cloudAppUrl } from "@workspace/config/referrals";
import { ArrowRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { type AiReferral, loadAiReferral, saveAiReferral } from "@/lib/ai-referral";

const CLOUD_URL = cloudAppUrl("marketing-ai-referral");

export function AiReferralBanner() {
	const [referral, setReferral] = useState<AiReferral | null>(null);

	useEffect(() => {
		setReferral(loadAiReferral());
	}, []);

	if (!referral || referral.dismissed) return null;

	const dismiss = () => {
		const next = { ...referral, dismissed: true };
		saveAiReferral(next);
		setReferral(next);
	};

	return (
		<div className="relative bg-zinc-950 text-sm text-zinc-300">
			<div className="mx-auto flex max-w-6xl items-center justify-center gap-x-2 px-10 py-2 text-center">
				<p>
					<span className="font-medium text-white">{referral.assistant} sent you here.</span> Want it to recommend you
					too?{" "}
					<a
						href={CLOUD_URL}
						className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-white underline decoration-zinc-500 underline-offset-4 hover:decoration-white"
					>
						Get started
						<ArrowRight className="size-3.5" aria-hidden="true" />
					</a>
				</p>
			</div>
			<button
				type="button"
				onClick={dismiss}
				aria-label="Dismiss"
				className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-500"
			>
				<X className="size-4" aria-hidden="true" />
			</button>
		</div>
	);
}
