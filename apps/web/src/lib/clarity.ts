import { onAnalyticsConsent } from "@workspace/ui/lib/cookie-consent";

type ClarityApi = ((command: string, ...args: unknown[]) => void) & { q?: unknown[][] };

declare global {
	interface Window {
		clarity?: ClarityApi;
	}
}

let injected = false;

function load(projectId: string): void {
	if (injected) return;
	injected = true;
	// Clarity replays this queue once its tag loads, so a choice made while the
	// script is still in flight isn't lost.
	window.clarity ??= Object.assign(
		(...args: unknown[]) => {
			window.clarity?.q?.push(args);
		},
		{ q: [] as unknown[][] },
	);
	const script = document.createElement("script");
	script.async = true;
	script.src = `https://www.clarity.ms/tag/${projectId}`;
	document.head.appendChild(script);
}

/**
 * Load Microsoft Clarity only while analytics consent is in effect.
 *
 * Clarity records session replays, so the tag is never fetched before the
 * visitor has answered — which is the whole reason it isn't a `<script>` in the
 * document head. Withdrawing consent erases Clarity's cookies and stops
 * recording on the spot.
 */
export function initClarity(projectId: string, consentRequired: boolean): () => void {
	return onAnalyticsConsent(consentRequired, (allowed) => {
		if (allowed) {
			load(projectId);
			// Without an explicit grant, Clarity runs cookieless for EEA, UK, and
			// Swiss visitors and can't stitch a session across pages. We don't use
			// its ads integration, so ad storage stays denied.
			window.clarity?.("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" });
			window.clarity?.("start");
		} else {
			window.clarity?.("consent", false);
			window.clarity?.("stop");
		}
	});
}
