import { useRouteContext } from "@tanstack/react-router";
import { legalUrl, showsLegalLinks } from "@workspace/config/legal";
import type { ClientConfig } from "@workspace/config/types";
import { cn } from "@workspace/ui/lib/utils";

/**
 * The "by doing this you agree to…" line under a signup or checkout action.
 *
 * Renders nothing in whitelabel deployments, where the operator's own
 * agreements govern and Elmo's would be the wrong thing to point at.
 */
export function LegalConsentNotice({ action, className }: { action: string; className?: string }) {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	if (!showsLegalLinks(context.clientConfig?.mode)) return null;

	const linkClass = "underline underline-offset-2 hover:text-foreground";

	return (
		<p className={cn("text-center text-xs text-muted-foreground", className)}>
			By {action} you agree to Elmo's{" "}
			<a href={legalUrl("terms")} target="_blank" rel="noreferrer" className={linkClass}>
				Terms of Service
			</a>{" "}
			and{" "}
			<a href={legalUrl("privacy")} target="_blank" rel="noreferrer" className={linkClass}>
				Privacy Policy
			</a>
			.
		</p>
	);
}
