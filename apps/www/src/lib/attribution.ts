import { CLOUD_APP_URL } from "@workspace/config/referrals";
import { withAttribution } from "@workspace/config/signup-attribution";
import { currentAttribution, rememberAttribution } from "@workspace/ui/lib/attribution";

// Pointerdown rather than click alone so a middle-click or "open in new tab"
// gets the rewritten link too; click covers keyboard activation.
const EVENTS = ["pointerdown", "click"] as const;

function forward(event: Event): void {
	const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
	if (!(anchor instanceof HTMLAnchorElement) || anchor.origin !== CLOUD_APP_URL) return;
	const href = withAttribution(anchor.href, currentAttribution("sessionStorage"));
	if (href !== anchor.href) anchor.href = href;
}

/**
 * Carries where the visitor first arrived from onto every link into the cloud
 * app, so a signup there can be attributed to the campaign that started it.
 */
export function forwardAttributionToApp(consentRequired: boolean): () => void {
	const stopRemembering = rememberAttribution("sessionStorage", consentRequired);
	for (const type of EVENTS) document.addEventListener(type, forward, { capture: true });
	return () => {
		stopRemembering();
		for (const type of EVENTS) document.removeEventListener(type, forward, { capture: true });
	};
}
