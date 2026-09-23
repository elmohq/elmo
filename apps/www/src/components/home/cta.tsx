import { CloudSignupCTA, SelfHostCTA } from "@/components/cta-buttons";

const SIZES = {
	md: "[&>a]:h-9 [&>a]:px-4",
	lg: "[&>a]:h-11 [&>a]:px-5 [&>a]:text-[15px] [&>a]:rounded-lg",
};

/** Every call to action on the page is this pair and nothing louder: cloud first, self-hosting beside it. */
export function CtaPair({ size = "md", className = "" }: { size?: keyof typeof SIZES; className?: string }) {
	return (
		<div className={`flex flex-wrap items-center justify-center gap-3 ${SIZES[size]} ${className}`}>
			<CloudSignupCTA />
			<SelfHostCTA />
		</div>
	);
}
