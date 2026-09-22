import { IconCloud } from "@tabler/icons-react";
import { useRouteContext } from "@tanstack/react-router";
import { cloudSignupUrl } from "@workspace/config/referrals";
import type { ClientConfig } from "@workspace/config/types";
import { buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { trackEventBeforeNavigation } from "@/lib/posthog";

const SIGNUP_URL = cloudSignupUrl("demo-app");

/**
 * The one ask the demo makes. A visitor clicking through sample data is the
 * most qualified reader we have, and until now the demo never suggested the
 * next step. Rendered only on a read-only deployment.
 */
export function DemoCloudCta() {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	if (!context.clientConfig?.features.readOnly) return null;

	return (
		<a
			href={SIGNUP_URL}
			onClick={() => trackEventBeforeNavigation("cta_click", { destination: "cloud-signup", source: "demo-app" })}
			className={cn(buttonVariants({ size: "sm" }), "ml-auto shrink-0")}
		>
			<IconCloud className="size-4" />
			<span className="hidden sm:inline">Track your own brand</span>
			<span className="sm:hidden">Your brand</span>
		</a>
	);
}
