/**
 * Crisp support chat.
 *
 * The chatbox exposes a queue-based SDK: every instruction is pushed onto
 * `window.$crisp` and replayed once the remote script finishes loading, so
 * callers never have to wait for a ready signal.
 */
import type { DeploymentMode } from "@workspace/config/types";

type CrispCommand = unknown[];

declare global {
	interface Window {
		$crisp?: CrispCommand[];
		CRISP_WEBSITE_ID?: string;
	}
}

const CRISP_SCRIPT_URL = "https://client.crisp.chat/l.js";

/** Guided walkthrough of the demo, offered to anyone who opens the chat there. */
const DEMO_WALKTHROUGH_URL = "https://cal.com/jrhizor/elmo";
const DEMO_WALKTHROUGH_MESSAGE = `👋 You're in the Elmo demo — it's read-only sample data, so click around freely. Want a guided walkthrough with the team? Grab a time here: ${DEMO_WALKTHROUGH_URL}`;

let initialized = false;

function push(command: CrispCommand): void {
	if (typeof window === "undefined") return;
	window.$crisp = window.$crisp ?? [];
	window.$crisp.push(command);
}

function setSessionData(entries: [string, string][]): void {
	push(["set", "session:data", [entries]]);
}

/**
 * Load the chatbox and tag the session with the deployment it came from.
 * A no-op without a website ID, which is how every deployment we don't operate
 * ends up with no chat widget at all.
 */
export function initCrisp(websiteId: string | undefined, mode: DeploymentMode): void {
	if (initialized || typeof window === "undefined" || !websiteId) return;
	initialized = true;

	window.$crisp = window.$crisp ?? [];
	window.CRISP_WEBSITE_ID = websiteId;

	push(["set", "session:segments", [[mode]]]);

	if (mode === "demo") {
		// Mirrored into session data so an operator or bot picking up the thread
		// suggests the same link the visitor was shown.
		setSessionData([
			["deployment_mode", mode],
			["walkthrough_url", DEMO_WALKTHROUGH_URL],
		]);
		showDemoWalkthroughOnOpen();
	} else {
		setSessionData([["deployment_mode", mode]]);
	}

	const script = document.createElement("script");
	script.src = CRISP_SCRIPT_URL;
	script.async = true;
	document.head.appendChild(script);
}

/**
 * Offer the walkthrough the first time someone opens the chat. `message:show`
 * renders locally only — it never reaches the inbox — so the booking link reads
 * as a prompt to the visitor rather than an unanswered conversation.
 */
function showDemoWalkthroughOnOpen(): void {
	let nudged = false;
	push([
		"on",
		"chat:opened",
		() => {
			if (nudged) return;
			nudged = true;
			push(["do", "message:show", ["text", DEMO_WALKTHROUGH_MESSAGE]]);
		},
	]);
}

export function identifyCrispUser(user: { id: string; email?: string; name?: string }): void {
	if (!initialized) return;
	if (user.email) push(["set", "user:email", [user.email]]);
	if (user.name) push(["set", "user:nickname", [user.name]]);
	setSessionData([["user_id", user.id]]);
}

/**
 * Drop the conversation on sign-out so the next person to sign in on this
 * browser doesn't inherit the previous user's chat history.
 */
export function resetCrispSession(): void {
	if (!initialized) return;
	push(["do", "session:reset"]);
}
