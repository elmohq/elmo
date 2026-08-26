/**
 * Crisp support chat.
 *
 * The chatbox exposes a queue-based SDK: every instruction is pushed onto
 * `window.$crisp` and replayed once the remote script finishes loading, so
 * callers never have to wait for a ready signal.
 */
type CrispCommand = unknown[];

declare global {
	interface Window {
		$crisp?: CrispCommand[];
		CRISP_WEBSITE_ID?: string;
	}
}

const CRISP_SCRIPT_URL = "https://client.crisp.chat/l.js";
const CRISP_WEBSITE_ID = "2f79a110-4e29-41a8-b45d-4993df6ff487";

let initialized = false;

export function initCrisp(): void {
	if (initialized || typeof window === "undefined") return;
	initialized = true;

	window.$crisp = [];
	window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;
	// Segments the inbox by where the visitor started, so a marketing-site
	// question is distinguishable from one raised inside the product.
	window.$crisp.push(["set", "session:segments", [["marketing"]]]);

	const script = document.createElement("script");
	script.src = CRISP_SCRIPT_URL;
	script.async = true;
	document.head.appendChild(script);
}
