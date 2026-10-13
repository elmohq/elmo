import { CLOUD_SIGNUP_URL } from "@workspace/config/plans";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ../crisp is the module under test. It cannot be a top-level import: it latches
// `initialized` on first load, so one shared instance would leave every case
// after the first talking to an already-initialised module.
async function loadCrisp() {
	vi.resetModules();
	return import("../crisp");
}

// The unit project runs in Node, so the two browser globals need standing up.
interface ScriptStub {
	src: string;
	async: boolean;
}

let appendedScripts: ScriptStub[];

function installBrowserGlobals(): void {
	appendedScripts = [];
	vi.stubGlobal("window", {} as Window);
	vi.stubGlobal("document", {
		createElement: () => ({ src: "", async: false }) as ScriptStub,
		head: { appendChild: (node: ScriptStub) => appendedScripts.push(node) },
	});
}

function queue(): unknown[][] {
	return ((window as unknown as { $crisp?: unknown[][] }).$crisp ?? []) as unknown[][];
}

function findCommand(action: string, method: string): unknown[] | undefined {
	return queue().find((command) => command[0] === action && command[1] === method);
}

// Runs the handler the module registered for a Crisp event, as the loaded chatbox would.
function fire(event: string): void {
	const handler = findCommand("on", event)?.[2] as (() => void) | undefined;
	if (!handler) throw new Error(`No handler registered for ${event}`);
	handler();
}

beforeEach(installBrowserGlobals);
afterEach(() => vi.unstubAllGlobals());

describe("initCrisp", () => {
	it("does nothing without a website ID", async () => {
		const { initCrisp } = await loadCrisp();

		initCrisp(undefined, "cloud");

		expect(appendedScripts).toEqual([]);
		expect(window.CRISP_WEBSITE_ID).toBeUndefined();
		expect(window.$crisp).toBeUndefined();
	});

	it("segments the session by deployment mode", async () => {
		const { initCrisp } = await loadCrisp();

		initCrisp("website-id", "cloud");

		expect(findCommand("set", "session:segments")).toEqual(["set", "session:segments", [["cloud"]]]);
	});

	it("loads the chatbox once however many times it is called", async () => {
		const { initCrisp } = await loadCrisp();

		initCrisp("website-id", "cloud");
		initCrisp("website-id", "cloud");

		expect(appendedScripts).toHaveLength(1);
		expect(window.CRISP_WEBSITE_ID).toBe("website-id");
	});
});

describe("the demo next steps", () => {
	it("offers every next step the first time the chat is opened, and only then", async () => {
		const { initCrisp } = await loadCrisp();

		initCrisp("website-id", "demo");

		fire("chat:opened");
		fire("chat:opened");

		const shown = queue().filter((command) => command[0] === "do" && command[1] === "message:show");
		expect(shown, "reopening the chat must not repeat the sequence").toHaveLength(2);

		const [, nextSteps] = (shown[1]?.[2] ?? []) as [string, string];
		const linked = [...String(nextSteps).matchAll(/\]\((https?:[^)]+)\)/g)].map((match) => match[1]);
		expect(linked).toEqual([
			"https://www.elmohq.com/demo?ref=demo-chat",
			CLOUD_SIGNUP_URL,
			"https://www.elmohq.com/docs/getting-started",
		]);
	});

	it("is not offered on cloud, which shares the same chatbox", async () => {
		const { initCrisp } = await loadCrisp();

		initCrisp("website-id", "cloud");
		fire("chat:opened");

		expect(findCommand("do", "message:show")).toBeUndefined();
	});
});

describe("the header launcher", () => {
	it("keeps Crisp's floating launcher hidden, including after the chat is closed", async () => {
		const { initCrisp, openCrispChat } = await loadCrisp();
		initCrisp("website-id", "cloud");
		expect(findCommand("do", "chat:hide")).toBeDefined();

		openCrispChat();
		expect(queue().slice(-2)).toEqual([
			["do", "chat:show"],
			["do", "chat:open"],
		]);

		fire("chat:opened");
		fire("chat:closed");
		expect(queue().at(-1)).toEqual(["do", "chat:hide"]);
	});

	it("is only offered where the chatbox loads", async () => {
		const { initCrisp, getCrispChatState, openCrispChat } = await loadCrisp();

		initCrisp(undefined, "local");
		openCrispChat();

		expect(getCrispChatState().launcher).toBe("none");
		expect(window.$crisp).toBeUndefined();

		initCrisp("website-id", "cloud");
		expect(getCrispChatState().launcher).toBe("header");
	});

	it("leaves the demo on Crisp's own floating launcher", async () => {
		const { initCrisp, getCrispChatState, openCrispChat } = await loadCrisp();

		initCrisp("website-id", "demo");
		openCrispChat();

		expect(getCrispChatState().launcher).toBe("floating");
		expect(findCommand("do", "chat:hide")).toBeUndefined();
		expect(findCommand("do", "chat:open")).toBeUndefined();
	});

	it("counts replies that arrive while the chat is closed until it is opened", async () => {
		const { initCrisp, getCrispChatState, subscribeCrispChat } = await loadCrisp();
		const listener = vi.fn();
		subscribeCrispChat(listener);
		initCrisp("website-id", "cloud");

		fire("message:received");
		fire("message:received");
		expect(getCrispChatState().unread).toBe(2);
		expect(listener).toHaveBeenCalled();

		fire("chat:opened");
		fire("message:received");
		expect(getCrispChatState().unread, "replies read in the open chat are not unread").toBe(0);

		fire("chat:closed");
		fire("message:received");
		expect(getCrispChatState().unread).toBe(1);
	});

	it("picks up replies left unread on an earlier page load", async () => {
		const { initCrisp, getCrispChatState } = await loadCrisp();
		initCrisp("website-id", "cloud");
		Object.assign(window.$crisp ?? [], { get: (key: string) => (key === "chat:unread:count" ? 3 : undefined) });

		fire("session:loaded");

		expect(getCrispChatState().unread).toBe(3);
	});
});

describe("session identity", () => {
	it("is dropped on sign-out so the next user starts fresh", async () => {
		const { initCrisp, resetCrispSession } = await loadCrisp();
		initCrisp("website-id", "cloud");

		resetCrispSession();

		expect(findCommand("do", "session:reset")).toEqual(["do", "session:reset"]);
	});

	it("does nothing at all when the chatbox was never loaded", async () => {
		const { identifyCrispUser, resetCrispSession } = await loadCrisp();

		identifyCrispUser({ id: "user-1", email: "a@example.com" });
		resetCrispSession();

		expect(window.$crisp).toBeUndefined();
	});

	it("carries a user identified before the chatbox loaded", async () => {
		const { initCrisp, identifyCrispUser } = await loadCrisp();

		identifyCrispUser({ id: "user-1", email: "a@example.com", name: "Ada" });
		initCrisp("website-id", "cloud");

		expect(findCommand("set", "user:email")).toEqual(["set", "user:email", ["a@example.com"]]);
		expect(findCommand("set", "user:nickname")).toEqual(["set", "user:nickname", ["Ada"]]);
	});

	it.each([
		["identified after load", false],
		["identified before load", true],
	])("leaves demo visitors anonymous (%s)", async (_label, identifyFirst) => {
		const { initCrisp, identifyCrispUser } = await loadCrisp();
		const demoUser = { id: "demo", email: "demo@elmohq.com", name: "Demo User" };

		if (identifyFirst) {
			identifyCrispUser(demoUser);
			initCrisp("website-id", "demo");
		} else {
			initCrisp("website-id", "demo");
			identifyCrispUser(demoUser);
		}

		expect(findCommand("set", "user:email")).toBeUndefined();
		expect(findCommand("set", "user:nickname")).toBeUndefined();
	});

	it("does not resurrect a signed-out user if the chatbox loads later", async () => {
		const { initCrisp, identifyCrispUser, resetCrispSession } = await loadCrisp();

		identifyCrispUser({ id: "user-1", email: "a@example.com" });
		resetCrispSession();
		initCrisp("website-id", "cloud");

		expect(findCommand("set", "user:email")).toBeUndefined();
	});
});
