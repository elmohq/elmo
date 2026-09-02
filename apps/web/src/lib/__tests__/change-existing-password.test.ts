import { afterEach, describe, expect, it, vi } from "vitest";

function requestUrl(input: RequestInfo | URL): string {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.href;
	return input.url;
}

async function requestBody(input: RequestInfo | URL, init: RequestInit | undefined): Promise<string> {
	if (typeof init?.body === "string") return init.body;
	if (input instanceof Request) return input.clone().text();
	return String(init?.body ?? "");
}

describe("changeExistingPassword", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		vi.resetModules();
	});

	it("posts current and new password to better-auth change-password", async () => {
		const fetchMock = vi.fn(async () => {
			return new Response(JSON.stringify({}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		});
		vi.stubGlobal("fetch", fetchMock);
		vi.resetModules();
		const { changeExistingPassword } = await import("../change-existing-password");

		await changeExistingPassword({
			currentPassword: "old-secret",
			newPassword: "new-secret-123",
		});

		expect(fetchMock).toHaveBeenCalled();
		const [input, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
		const url = requestUrl(input);
		expect(url).toContain("/api/auth/change-password");
		expect(url).not.toContain("forgot-password");
		expect(url).not.toContain("reset-password");
		expect(url).not.toContain("/.well-known/change-password");
		expect((init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()).toBe("POST");

		const body = JSON.parse(await requestBody(input, init)) as Record<string, unknown>;
		expect(body.currentPassword).toBe("old-secret");
		expect(body.newPassword).toBe("new-secret-123");
	});
});
