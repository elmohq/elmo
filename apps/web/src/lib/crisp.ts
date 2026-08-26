// Crisp replays anything pushed onto `window.$crisp` once its script loads, so
// nothing here has to wait for a ready signal.
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

const DEMO_GREETING =
	"👋 You're in the Elmo demo — it's read-only sample data, so click around freely. Ask me anything as you go.";

// Not a carousel: at chatbox width its track shows one card at a time, which
// left the last option off screen.
const DEMO_NEXT_STEPS = [
	"Whenever you're ready:",
	`• [Book a walkthrough](${DEMO_WALKTHROUGH_URL}) — 30 minutes on your own brand's data`,
	`• [Start with Elmo Cloud](${CLOUD_SIGNUP_URL}) — the managed version, nothing to deploy`,
	`• [Self-host it free](${SELF_HOST_DOCS_URL}) — open source, running in about five minutes`,
].join("\n");

interface CrispUser {
	id: string;
	email?: string;
	name?: string;
}

let initialized = false;
let loadedMode: DeploymentMode | null = null;
let pendingUser: CrispUser | null = null;

function push(command: CrispCommand): void {
	if (typeof window === "undefined") return;
	window.$crisp = window.$crisp ?? [];
	window.$crisp.push(command);
}

function setSessionData(entries: [string, string][]): void {
	push(["set", "session:data", [entries]]);
}

// The missing website ID is what keeps the widget off deployments we don't operate.
export function initCrisp(websiteId: string | undefined, mode: DeploymentMode): void {
	if (initialized || typeof window === "undefined" || !websiteId) return;
	initialized = true;
	loadedMode = mode;

	window.$crisp = window.$crisp ?? [];
	window.CRISP_WEBSITE_ID = websiteId;

	push(["set", "session:segments", [[mode]]]);

	if (mode === "demo") {
		// So an operator picking up the thread points at the same three places.
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

	if (pendingUser) {
		if (mode !== "demo") applyUser(pendingUser);
		pendingUser = null;
	}

	const script = document.createElement("script");
	script.src = CRISP_SCRIPT_URL;
	script.async = true;
	document.head.appendChild(script);
}

// `message:show` renders locally only, so this never lands in the inbox as an
// unanswered conversation.
function showDemoNextStepsOnOpen(): void {
	let offered = false;
	push([
		"on",
		"chat:opened",
		() => {
			if (offered) return;
			offered = true;
			push(["do", "message:show", ["text", DEMO_GREETING]]);
			push(["do", "message:show", ["text", DEMO_NEXT_STEPS]]);
		},
	]);
}

function applyUser(user: CrispUser): void {
	if (user.email) push(["set", "user:email", [user.email]]);
	if (user.name) push(["set", "user:nickname", [user.name]]);
	setSessionData([["user_id", user.id]]);
}

/**
 * Held until the chatbox loads because React flushes child effects first, so the
 * route that knows the user runs before the root route that loads Crisp.
 *
 * Skipped on demo, where everyone shares the one advertised account and tagging
 * sessions with it would merge every visitor into a single Crisp contact.
 */
export function identifyCrispUser(user: CrispUser): void {
	if (!initialized) {
		pendingUser = user;
		return;
	}
	if (loadedMode === "demo") return;
	applyUser(user);
}

// So the next person to sign in on this browser doesn't inherit the conversation.
export function resetCrispSession(): void {
	pendingUser = null;
	if (!initialized) return;
	push(["do", "session:reset"]);
}
