import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateApiRequest = vi.hoisted(() => vi.fn());

vi.mock("../authentication.server", () => ({ authenticateApiRequest }));

import { createApiHandler } from "../handler";

describe("createApiHandler cloud scope", () => {
	beforeEach(() => {
		authenticateApiRequest.mockResolvedValue({
			ok: true,
			scope: { kind: "organization", organizationId: "org-1", apiKeyId: "key-1" },
		});
	});

	it("does not call an existing handler without organization-scope opt-in", async () => {
		const handle = vi.fn().mockResolvedValue({ ok: true });
		const handler = createApiHandler({ handle });
		const response = await handler({ request: new Request("https://app.example/api/v1/prompts"), params: {} });

		expect(response.status).toBe(403);
		expect(handle).not.toHaveBeenCalled();
	});

	it("passes organization identity to an explicitly scoped handler", async () => {
		const handle = vi.fn().mockResolvedValue({ ok: true });
		const handler = createApiHandler({ cloudOrganizationScoped: true, handle });
		const request = new Request("https://app.example/api/v1/prompts");
		const response = await handler({ request, params: {} });

		expect(response.status).toBe(200);
		expect(handle).toHaveBeenCalledWith({
			params: {},
			body: undefined,
			request,
			scope: { kind: "organization", organizationId: "org-1", apiKeyId: "key-1" },
		});
	});

	it("fails closed when key verification is unavailable", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		authenticateApiRequest.mockRejectedValue(new Error("database unavailable"));
		const handle = vi.fn().mockResolvedValue({ ok: true });
		const handler = createApiHandler({ cloudOrganizationScoped: true, handle });
		const response = await handler({ request: new Request("https://app.example/api/v1/prompts"), params: {} });

		expect(response.status).toBe(500);
		expect(handle).not.toHaveBeenCalled();
		expect(consoleError).toHaveBeenCalledOnce();
	});
});
