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

// A support chat's first job is to invite the question, so the greeting does
// that and the routes out follow as a separate message.
const DEMO_GREETING =
	"👋 You're in the Elmo demo — it's read-only sample data, so click around freely. Ask me anything as you go.";

/**
 * The routes out of the demo, ordered by what the chat is uniquely good for: a
 * walkthrough needs a person, the other two are self-serve. Markdown links in a
 * plain message keep all three on screen — a carousel puts its cards on a
 * horizontal track that only shows one at a time at chatbox width.
 */
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
/** Set when a user is identified before the chatbox has loaded; see identifyCrispUser. */
let pendingUser: CrispUser | null = null;

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
	loadedMode = mode;

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

	if (pendingUser) {
		if (mode !== "demo") applyUser(pendingUser);
		pendingUser = null;
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
 * Attach the signed-in user to the conversation.
 *
 * Skipped on the demo, where everyone signs in through the one advertised
 * account: tagging each visitor with the shared address would collapse them
 * into a single Crisp contact and tell an operator nothing. Anonymous is the
 * honest answer there.
 *
 * The route that knows who is signed in sits below the one that loads the
 * chatbox, and React flushes child effects before parent effects, so this can
 * run first. Holding the identity until the chatbox loads keeps the order from
 * mattering — otherwise support conversations would all be anonymous.
 */
export function identifyCrispUser(user: CrispUser): void {
	if (!initialized) {
		pendingUser = user;
		return;
	}
	if (loadedMode === "demo") return;
	applyUser(user);
}

/**
 * Drop the conversation on sign-out so the next person to sign in on this
 * browser doesn't inherit the previous user's chat history.
 */
export function resetCrispSession(): void {
	pendingUser = null;
	if (!initialized) return;
	push(["do", "session:reset"]);
}
