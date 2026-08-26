import { CRISP_WEBSITE_ID } from "@workspace/config/constants";

type CrispCommand = unknown[];

declare global {
	interface Window {
		$crisp?: CrispCommand[];
		CRISP_WEBSITE_ID?: string;
	}
}

const CRISP_SCRIPT_URL = "https://client.crisp.chat/l.js";

let initialized = false;

export function initCrisp(): void {
	if (initialized || typeof window === "undefined") return;
	initialized = true;

	window.$crisp = [];
	window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;
	// So a marketing-site question is distinguishable from one raised in the product.
	window.$crisp.push(["set", "session:segments", [["marketing"]]]);

	const script = document.createElement("script");
	script.src = CRISP_SCRIPT_URL;
	script.async = true;
	document.head.appendChild(script);
}
