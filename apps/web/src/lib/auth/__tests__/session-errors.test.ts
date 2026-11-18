import { describe, expect, it, vi } from "vitest";
import { signInAgain } from "../session-errors";

describe("signInAgain", () => {
	it("sends the browser to sign in once, coming back to where it was", () => {
		const assign = vi.fn();
		const location = { pathname: "/app/org/acme/settings", search: "?tab=keys", hash: "#top", assign };

		signInAgain(location);
		signInAgain(location);

		expect(assign).toHaveBeenCalledTimes(1);
		const target = new URL(assign.mock.calls[0][0], "https://elmo.test");
		expect(target.pathname).toBe("/auth/login");
		expect(target.searchParams.get("returnTo")).toBe("/app/org/acme/settings?tab=keys#top");
	});
});
