import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getConfigActor, requireConfigWrite, requireEntityWrite } from "./config-gates";

// Mutable state the module mocks read from. `vi.hoisted` keeps it reachable from
// the hoisted `vi.mock` factories below.
const state = vi.hoisted(() => ({
	mode: "local" as "local" | "cloud" | "whitelabel" | "demo",
	memberRow: undefined as { role: string } | undefined,
	session: null as { user: { id: string; role: string | null } } | null,
}));

vi.mock("@workspace/lib/db/db", () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: () => (state.memberRow ? [state.memberRow] : []),
				}),
			}),
		}),
	},
}));

vi.mock("@/lib/config/server", () => ({
	getDeployment: () => ({ mode: state.mode }),
}));

vi.mock("@/lib/auth/helpers", () => ({
	requireAuthSession: async () => {
		if (!state.session) throw new Error("Unauthorized: Authentication required");
		return state.session;
	},
	isAdmin: (s: { user?: { role?: string | null } } | null) => s?.user?.role === "admin",
}));

type SessionArg = Parameters<typeof getConfigActor>[0];
const sessionOf = (role: string | null, id = "u-1"): SessionArg =>
	({ user: { id, role } }) as unknown as SessionArg;

const ADMIN_SESSION = { user: { id: "u-admin", role: "admin" } };
const USER_SESSION = { user: { id: "u-1", role: null } };

beforeEach(() => {
	state.mode = "local";
	state.memberRow = undefined;
	state.session = null;
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("getConfigActor", () => {
	it("marks a session with role=admin as an instance admin", async () => {
		expect(await getConfigActor(sessionOf("admin"), null)).toEqual({ isInstanceAdmin: true, orgRole: null });
	});

	it("reads org-admin role from the member row", async () => {
		state.memberRow = { role: "admin" };
		expect(await getConfigActor(sessionOf(null), "org-1")).toEqual({ isInstanceAdmin: false, orgRole: "admin" });
	});

	it("reads org-member role from the member row", async () => {
		state.memberRow = { role: "member" };
		expect(await getConfigActor(sessionOf(null), "org-1")).toEqual({ isInstanceAdmin: false, orgRole: "member" });
	});

	it("returns orgRole null for a non-member of the org", async () => {
		state.memberRow = undefined;
		expect(await getConfigActor(sessionOf(null), "org-1")).toEqual({ isInstanceAdmin: false, orgRole: null });
	});

	it("skips the membership query when orgId is null", async () => {
		state.memberRow = { role: "admin" }; // present, but must be ignored
		expect(await getConfigActor(sessionOf(null), null)).toEqual({ isInstanceAdmin: false, orgRole: null });
	});
});

describe("requireConfigWrite", () => {
	it("allows a cloud org member to write a brand run-config key", async () => {
		state.mode = "cloud";
		state.session = USER_SESSION;
		state.memberRow = { role: "member" };
		await expect(requireConfigWrite({ key: "run.enabled_models", scope: "brand", orgId: "org-1" })).resolves
			.toBeUndefined();
	});

	it("throws the deny reason when a member writes a sampling key", async () => {
		state.mode = "cloud";
		state.session = USER_SESSION;
		state.memberRow = { role: "member" };
		await expect(requireConfigWrite({ key: "run.cadence_hours", scope: "brand", orgId: "org-1" })).rejects
			.toThrow("instance-admin-required");
	});

	it("denies every write in demo, including the instance admin", async () => {
		state.mode = "demo";
		state.session = ADMIN_SESSION;
		await expect(requireConfigWrite({ key: "run.enabled_models", scope: "brand", orgId: "org-1" })).rejects
			.toThrow("writes-disabled");
	});

	it("rejects a whitelabel prompt-scope write even for the instance admin", async () => {
		state.mode = "whitelabel";
		state.session = ADMIN_SESSION;
		await expect(requireConfigWrite({ key: "run.model_enabled", scope: "prompt", orgId: "org-1" })).rejects
			.toThrow("prompt-level-disabled");
	});

	it("requires a session", async () => {
		state.session = null;
		await expect(requireConfigWrite({ key: "run.enabled_models", scope: "brand", orgId: "org-1" })).rejects
			.toThrow("Unauthorized");
	});
});

describe("requireEntityWrite", () => {
	it("allows an instance admin to write entities", async () => {
		state.mode = "cloud";
		state.session = ADMIN_SESSION;
		await expect(requireEntityWrite("model_targets")).resolves.toBeUndefined();
	});

	it("denies a non-instance-admin from writing organization_settings (staff-only)", async () => {
		state.mode = "cloud";
		state.session = USER_SESSION;
		await expect(requireEntityWrite("organization_settings")).rejects.toThrow("instance-admin-required");
	});

	it("denies entity writes in demo for the instance admin", async () => {
		state.mode = "demo";
		state.session = ADMIN_SESSION;
		await expect(requireEntityWrite("provider_credentials")).rejects.toThrow("writes-disabled");
	});
});
