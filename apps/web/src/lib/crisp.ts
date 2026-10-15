// Crisp replays anything pushed onto `window.$crisp` once its script loads, so
// nothing here has to wait for a ready signal.
import { CLOUD_SIGNUP_URL } from "@workspace/config/plans";
import { bookDemoUrl } from "@workspace/config/referrals";
import type { DeploymentMode } from "@workspace/config/types";

type CrispCommand = unknown[];

declare global {
	interface Window {
		// Once loaded, Crisp swaps the queue for its own object, which can also be read from.
		$crisp?: CrispCommand[] & { get?: (key: string) => unknown };
		CRISP_WEBSITE_ID?: string;
	}
}

const CRISP_SCRIPT_URL = "https://client.crisp.chat/l.js";

const DEMO_WALKTHROUGH_URL = bookDemoUrl("demo-chat");
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

// So an operator picking up the thread points at the same three places.
const DEMO_SESSION_DATA: [string, string][] = [
	["walkthrough_url", DEMO_WALKTHROUGH_URL],
	["self_host_docs_url", SELF_HOST_DOCS_URL],
	["cloud_signup_url", CLOUD_SIGNUP_URL],
];

interface CrispUser {
	id: string;
	email?: string;
	name?: string;
}

export interface CrispChatState {
	/** Which control opens the chatbox, if it loaded at all. */
	launcher: "none" | "header" | "floating";
	unread: number;
}

let loadedMode: DeploymentMode | null = null;
let pendingUser: CrispUser | null = null;
let chatOpen = false;
let chatState: CrispChatState = { launcher: "none", unread: 0 };
const chatListeners = new Set<() => void>();
const SERVER_CHAT_STATE: CrispChatState = { launcher: "none", unread: 0 };

function setChatState(next: Partial<CrispChatState>): void {
	chatState = { ...chatState, ...next };
	for (const listener of chatListeners) listener();
}

export function subscribeCrispChat(listener: () => void): () => void {
	chatListeners.add(listener);
	return () => chatListeners.delete(listener);
}

export function getCrispChatState(): CrispChatState {
	return chatState;
}

export function getServerCrispChatState(): CrispChatState {
	return SERVER_CHAT_STATE;
}

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
	if (loadedMode || typeof window === "undefined" || !websiteId) return;
	loadedMode = mode;

	window.$crisp = window.$crisp ?? [];
	window.CRISP_WEBSITE_ID = websiteId;

	push(["set", "session:segments", [[mode]]]);
	setSessionData([["deployment_mode", mode], ...(mode === "demo" ? DEMO_SESSION_DATA : [])]);
	// The demo is a sales surface, so it keeps Crisp's own launcher, which draws
	// visitors into a conversation better than a header button does.
	const launcher = mode === "demo" ? "floating" : "header";
	if (launcher === "header") replaceFloatingLauncher();
	else push(["on", "chat:opened", demoNextStepsOffer()]);

	const pending = pendingUser;
	pendingUser = null;
	if (pending) identifyCrispUser(pending);

	const script = document.createElement("script");
	script.src = CRISP_SCRIPT_URL;
	script.async = true;
	document.head.appendChild(script);
	setChatState({ launcher });
}

/**
 * Crisp's floating launcher sat on top of whatever pages put bottom-right, so it
 * stays hidden and the header's support button opens the chatbox instead. With
 * no launcher to badge, replies that land while the chat is closed are counted
 * here for the button to show.
 */
function replaceFloatingLauncher(): void {
	push(["do", "chat:hide"]);
	push([
		"on",
		"chat:opened",
		() => {
			chatOpen = true;
			setChatState({ unread: 0 });
		},
	]);
	push([
		"on",
		"chat:closed",
		() => {
			chatOpen = false;
			push(["do", "chat:hide"]);
		},
	]);
	push([
		"on",
		"message:received",
		() => {
			if (!chatOpen) setChatState({ unread: chatState.unread + 1 });
		},
	]);
	// Picks up replies that arrived while the visitor was on another page or away.
	push([
		"on",
		"session:loaded",
		() => {
			const unread = Number(window.$crisp?.get?.("chat:unread:count") ?? 0);
			if (!chatOpen && unread > 0) setChatState({ unread });
		},
	]);
}

export function openCrispChat(): void {
	if (chatState.launcher !== "header") return;
	push(["do", "chat:show"]);
	push(["do", "chat:open"]);
}

// `message:show` renders locally only, so this never lands in the inbox as an
// unanswered conversation.
function demoNextStepsOffer(): () => void {
	let offered = false;
	return () => {
		if (offered) return;
		offered = true;
		push(["do", "message:show", ["text", DEMO_GREETING]]);
		push(["do", "message:show", ["text", DEMO_NEXT_STEPS]]);
	};
}

/**
 * Held until the chatbox loads because React flushes child effects first, so the
 * route that knows the user runs before the root route that loads Crisp.
 *
 * Skipped on demo, where everyone shares the one advertised account and tagging
 * sessions with it would merge every visitor into a single Crisp contact.
 */
export function identifyCrispUser(user: CrispUser): void {
	if (!loadedMode) {
		pendingUser = user;
		return;
	}
	if (loadedMode === "demo") return;
	if (user.email) push(["set", "user:email", [user.email]]);
	if (user.name) push(["set", "user:nickname", [user.name]]);
	setSessionData([["user_id", user.id]]);
}

// So the next person to sign in on this browser doesn't inherit the conversation.
export function resetCrispSession(): void {
	pendingUser = null;
	if (!loadedMode) return;
	setChatState({ unread: 0 });
	push(["do", "session:reset"]);
}
