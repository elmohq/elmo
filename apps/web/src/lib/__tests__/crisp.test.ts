import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeploymentMode } from "@workspace/config/types";

// The unit project runs in Node, so stand up just enough of the two browser
// globals the loader touches.
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

/** Fresh module per case — the loader deliberately only ever runs once. */
async function loadCrisp() {
	vi.resetModules();
	return import("../crisp");
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

	it("loads the chatbox and segments the session by deployment mode", async () => {
		const { initCrisp } = await loadCrisp();

		initCrisp("website-id", "cloud");

		expect(appendedScripts).toEqual([{ src: "https://client.crisp.chat/l.js", async: true }]);
		expect(window.CRISP_WEBSITE_ID).toBe("website-id");
		expect(findCommand("set", "session:segments")).toEqual(["set", "session:segments", [["cloud"]]]);
	});

	it("loads the chatbox only once", async () => {
		const { initCrisp } = await loadCrisp();

		initCrisp("website-id", "cloud");
		initCrisp("website-id", "cloud");

		expect(appendedScripts).toHaveLength(1);
	});

	it("offers the demo walkthrough the first time the chat is opened", async () => {
		const { initCrisp } = await loadCrisp();

		initCrisp("website-id", "demo");
		const listener = findCommand("on", "chat:opened");
		expect(listener).toBeDefined();

		(listener?.[2] as () => void)();
		(listener?.[2] as () => void)();

		const shown = queue().filter((command) => command[0] === "do" && command[1] === "message:show");
		expect(shown).toHaveLength(1);
		expect(String((shown[0]?.[2] as [string, string])[1])).toContain("https://cal.com/jrhizor/elmo");
	});

	it.each(["cloud", "local", "whitelabel"] satisfies DeploymentMode[])(
		"does not offer the demo walkthrough in %s mode",
		async (mode) => {
			const { initCrisp } = await loadCrisp();

			initCrisp("website-id", mode);

			expect(findCommand("on", "chat:opened")).toBeUndefined();
		},
	);
});

describe("identifyCrispUser", () => {
	it("attaches the signed-in user to the session", async () => {
		const { initCrisp, identifyCrispUser } = await loadCrisp();
		initCrisp("website-id", "cloud");

		identifyCrispUser({ id: "user-1", email: "a@example.com", name: "Ada" });

		expect(findCommand("set", "user:email")).toEqual(["set", "user:email", ["a@example.com"]]);
		expect(findCommand("set", "user:nickname")).toEqual(["set", "user:nickname", ["Ada"]]);
	});

	it("stays quiet when the chatbox was never loaded", async () => {
		const { identifyCrispUser } = await loadCrisp();

		identifyCrispUser({ id: "user-1", email: "a@example.com" });

		expect(window.$crisp).toBeUndefined();
	});
});

describe("resetCrispSession", () => {
	it("clears the conversation so the next sign-in starts fresh", async () => {
		const { initCrisp, resetCrispSession } = await loadCrisp();
		initCrisp("website-id", "cloud");

		resetCrispSession();

		expect(findCommand("do", "session:reset")).toEqual(["do", "session:reset"]);
	});
});
