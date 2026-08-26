/**
 * Crisp support chat.
 *
 * The chatbox exposes a queue-based SDK: every instruction is pushed onto
 * `window.$crisp` and replayed once the remote script finishes loading, so
 * callers never have to wait for a ready signal.
 */
import { CLOUD_SIGNUP_URL } from "@workspace/config/plans";
import type { DeploymentMode } from "@workspace/config/types";

type CrispCommand = unknown[];

declare global {
	interface Window {
		$crisp?: CrispCommand[];
		CRISP_WEBSITE_ID?: string;
	}
}

const CRISP_SCRIPT_URL = "https://client.crisp.chat/l.js";

const DEMO_WALKTHROUGH_URL = "https://cal.com/jrhizor/elmo";
const SELF_HOST_DOCS_URL = "https://www.elmohq.com/docs/getting-started";

const DEMO_GREETING = "👋 You're in the Elmo demo — it's read-only sample data, so click around freely.";

/** The three ways out of the demo, offered as linked cards. */
const DEMO_NEXT_STEPS = {
	text: "Whenever you're ready, here's where to go next:",
	targets: [
		{
			title: "See it on your own brand",
			description: "A live walkthrough with the team, using your data instead of ours.",
			actions: [{ label: "Book a time", url: DEMO_WALKTHROUGH_URL }],
		},
		{
			title: "Run it yourself",
			description: "Elmo is open source and free to self-host. Up in about five minutes.",
			actions: [{ label: "Read the setup guide", url: SELF_HOST_DOCS_URL }],
		},
		{
			title: "Let us run it",
			description: "Elmo Cloud is the managed version — nothing to deploy or maintain.",
			actions: [{ label: "Start with Cloud", url: CLOUD_SIGNUP_URL }],
		},
	],
};

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
		// points at the same three places the visitor was shown.
		setSessionData([
			["deployment_mode", mode],
			["walkthrough_url", DEMO_WALKTHROUGH_URL],
			["self_host_docs_url", SELF_HOST_DOCS_URL],
			["cloud_signup_url", CLOUD_SIGNUP_URL],
		]);
		showDemoNextStepsOnOpen();
	} else {
		setSessionData([["deployment_mode", mode]]);
	}

	const script = document.createElement("script");
	script.src = CRISP_SCRIPT_URL;
	script.async = true;
	document.head.appendChild(script);
}

/**
 * Greet the visitor and offer the three next steps the first time they open the
 * chat. `message:show` renders locally only — it never reaches the inbox — so
 * these read as a prompt to the visitor rather than an unanswered conversation.
 */
function showDemoNextStepsOnOpen(): void {
	let offered = false;
	push([
		"on",
		"chat:opened",
		() => {
			if (offered) return;
			offered = true;
			push(["do", "message:show", ["text", DEMO_GREETING]]);
			push(["do", "message:show", ["carousel", DEMO_NEXT_STEPS]]);
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
