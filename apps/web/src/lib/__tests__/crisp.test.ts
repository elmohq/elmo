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
		const openChat = findCommand("on", "chat:opened")?.[2] as (() => void) | undefined;
		expect(openChat).toBeDefined();

		openChat?.();
		openChat?.();

		const shown = queue().filter((command) => command[0] === "do" && command[1] === "message:show");
		expect(shown, "reopening the chat must not repeat the sequence").toHaveLength(2);

		const [, nextSteps] = (shown[1]?.[2] ?? []) as [string, string];
		const linked = [...String(nextSteps).matchAll(/\]\((https?:[^)]+)\)/g)].map((match) => match[1]);
		expect(linked).toEqual([
			"https://cal.com/jrhizor/elmo",
			CLOUD_SIGNUP_URL,
			"https://www.elmohq.com/docs/getting-started",
		]);
	});

	it("is not offered on cloud, which shares the same chatbox", async () => {
		const { initCrisp } = await loadCrisp();

		initCrisp("website-id", "cloud");

		expect(findCommand("on", "chat:opened")).toBeUndefined();
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
