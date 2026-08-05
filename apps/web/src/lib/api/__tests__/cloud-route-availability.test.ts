import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	authenticateApiRequest: vi.fn(),
	createInstanceBrand: vi.fn(),
	createOrganizationApiBrand: vi.fn(),
	createOrganizationApiPrompt: vi.fn(),
	getOrganizationApiPrompt: vi.fn(),
	rejectOrganizationApiPromptDeletion: vi.fn(),
	updateOrganizationApiPrompt: vi.fn(),
	createPromptJobScheduler: vi.fn(),
	removePromptJobScheduler: vi.fn(),
}));

vi.mock("../authentication.server", () => ({ authenticateApiRequest: mocks.authenticateApiRequest }));
vi.mock("@workspace/lib/cloud/api-resources", async (importOriginal) => ({
	...(await importOriginal<typeof import("@workspace/lib/cloud/api-resources")>()),
	createOrganizationApiBrand: mocks.createOrganizationApiBrand,
	createOrganizationApiPrompt: mocks.createOrganizationApiPrompt,
	getOrganizationApiPrompt: mocks.getOrganizationApiPrompt,
	rejectOrganizationApiPromptDeletion: mocks.rejectOrganizationApiPromptDeletion,
	updateOrganizationApiPrompt: mocks.updateOrganizationApiPrompt,
}));
vi.mock("@/server/onboarding-core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/server/onboarding-core")>()),
	createBrand: mocks.createInstanceBrand,
}));
vi.mock("@/lib/job-scheduler", () => ({
	createPromptJobScheduler: mocks.createPromptJobScheduler,
	removePromptJobScheduler: mocks.removePromptJobScheduler,
	sendReportJob: vi.fn(),
}));

import { OrganizationResourceConflictError } from "@workspace/lib/cloud/api-resources";
import { Route as brandsRoute } from "../../../routes/api/v1/brands/index";
import { Route as competitorRoute } from "../../../routes/api/v1/competitors/$competitorId";
import { Route as promptRoute } from "../../../routes/api/v1/prompts/$promptId";
import { Route as promptsRoute } from "../../../routes/api/v1/prompts/index";
import { Route as reportsRoute } from "../../../routes/api/v1/reports/index";
import { Route as analyzeRoute } from "../../../routes/api/v1/tools/analyze";

type RouteHandler = (input: { request: Request; params: Record<string, string> }) => Promise<Response>;

function handler(route: unknown, method: string): RouteHandler {
	const value = (route as { options: { server?: { handlers?: Record<string, unknown> } } }).options.server?.handlers?.[
		method
	];
	if (typeof value !== "function") throw new Error(`Missing ${method} route handler`);
	return value as RouteHandler;
}

describe("cloud API route availability", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.authenticateApiRequest.mockResolvedValue({
			ok: true,
			scope: { kind: "organization", organizationId: "org-a", apiKeyId: "key-a" },
		});
	});

	it.each([
		["tools/analyze", handler(analyzeRoute, "POST"), "POST"],
		["reports", handler(reportsRoute, "GET"), "GET"],
		["reports", handler(reportsRoute, "POST"), "POST"],
		["competitors/00000000-0000-0000-0000-000000000001", handler(competitorRoute, "DELETE"), "DELETE"],
	])("keeps /api/v1/%s unavailable to organization keys", async (path, routeHandler, method) => {
		const response = await routeHandler({
			request: new Request(`https://app.example/api/v1/${path}`, { method }),
			params: { competitorId: "00000000-0000-0000-0000-000000000001" },
		});

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error: "Forbidden",
			message: "This API route has not enabled organization-scoped cloud access",
		});
	});

	it("passes the authenticated organization into an enabled resource read", async () => {
		mocks.getOrganizationApiPrompt.mockResolvedValue({ id: "00000000-0000-0000-0000-000000000001" });
		const response = await handler(
			promptRoute,
			"GET",
		)({
			request: new Request("https://app.example/api/v1/prompts/00000000-0000-0000-0000-000000000001"),
			params: { promptId: "00000000-0000-0000-0000-000000000001" },
		});

		expect(response.status).toBe(200);
		expect(mocks.getOrganizationApiPrompt).toHaveBeenCalledWith("org-a", "00000000-0000-0000-0000-000000000001");
	});

	it("attaches a new cloud brand to the key organization without invoking instance provisioning", async () => {
		mocks.createOrganizationApiBrand.mockResolvedValue({
			id: "brand-a",
			organizationId: "org-a",
			name: "Brand A",
			website: "https://brand.example",
			additionalDomains: [],
			aliases: [],
			enabled: true,
			onboarded: true,
			createdAt: new Date("2026-01-01T00:00:00Z"),
			updatedAt: new Date("2026-01-01T00:00:00Z"),
		});
		const response = await handler(
			brandsRoute,
			"POST",
		)({
			request: new Request("https://app.example/api/v1/brands", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id: "brand-a", name: "Brand A", domains: ["brand.example"] }),
			}),
			params: {},
		});

		expect(response.status).toBe(201);
		expect(mocks.createOrganizationApiBrand).toHaveBeenCalledWith(
			expect.objectContaining({ organizationId: "org-a", id: "brand-a" }),
		);
		expect(mocks.createInstanceBrand).not.toHaveBeenCalled();
	});

	it("uses plan-based prompt mutations instead of legacy schedulers in cloud", async () => {
		mocks.createOrganizationApiPrompt.mockResolvedValue({ id: "00000000-0000-0000-0000-000000000001" });
		mocks.updateOrganizationApiPrompt.mockResolvedValue({ id: "00000000-0000-0000-0000-000000000001" });

		const createResponse = await handler(
			promptsRoute,
			"POST",
		)({
			request: new Request("https://app.example/api/v1/prompts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ brandId: "brand-a", value: "Where should I shop?" }),
			}),
			params: {},
		});
		const updateResponse = await handler(
			promptRoute,
			"PATCH",
		)({
			request: new Request("https://app.example/api/v1/prompts/00000000-0000-0000-0000-000000000001", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ enabled: false }),
			}),
			params: { promptId: "00000000-0000-0000-0000-000000000001" },
		});

		expect(createResponse.status).toBe(201);
		expect(updateResponse.status).toBe(200);
		expect(mocks.createOrganizationApiPrompt).toHaveBeenCalledWith(
			expect.objectContaining({ organizationId: "org-a", brandId: "brand-a" }),
		);
		expect(mocks.updateOrganizationApiPrompt).toHaveBeenCalledWith(
			expect.objectContaining({ organizationId: "org-a", enabled: false }),
		);
		expect(mocks.createPromptJobScheduler).not.toHaveBeenCalled();
		expect(mocks.removePromptJobScheduler).not.toHaveBeenCalled();
	});

	it("returns a retention conflict for cloud prompt deletion without invoking a legacy scheduler", async () => {
		mocks.rejectOrganizationApiPromptDeletion.mockRejectedValue(
			new OrganizationResourceConflictError(
				"Cloud prompts retain tracking and provider audit history. Set enabled to false with PATCH instead.",
			),
		);
		const response = await handler(
			promptRoute,
			"DELETE",
		)({
			request: new Request("https://app.example/api/v1/prompts/00000000-0000-0000-0000-000000000001", {
				method: "DELETE",
			}),
			params: { promptId: "00000000-0000-0000-0000-000000000001" },
		});

		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ message: expect.stringContaining("enabled to false") });
		expect(mocks.rejectOrganizationApiPromptDeletion).toHaveBeenCalledWith(
			"org-a",
			"00000000-0000-0000-0000-000000000001",
		);
		expect(mocks.removePromptJobScheduler).not.toHaveBeenCalled();
	});
});
