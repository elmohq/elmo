import { onAnalyticsConsent } from "@workspace/ui/lib/cookie-consent";

type ClarityApi = (command: string, ...args: unknown[]) => void;

declare global {
	interface Window {
		clarity?: ClarityApi;
	}
}

let injected = false;

function load(projectId: string): void {
	if (injected) return;
	injected = true;
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
 * document head. Withdrawing consent stops recording on the spot.
 */
export function initClarity(projectId: string, consentRequired: boolean): () => void {
	return onAnalyticsConsent(consentRequired, (allowed) => {
		if (allowed) {
			load(projectId);
			window.clarity?.("start");
		} else {
			window.clarity?.("stop");
		}
	});
}
