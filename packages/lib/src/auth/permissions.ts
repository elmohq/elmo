/**
 * Access control definitions for the application.
 *
 * Uses better-auth's built-in access control system to define resources,
 * actions, and role-based permission grants. Shared across all deployment modes.
 */
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

export const statement = {
	...defaultStatements,
	brand: ["read", "create", "update", "delete"],
	report: ["generate"],
	/**
	 * Who may mint and revoke the organization's API keys. Read by the api-key
	 * plugin (`references: "organization"`) before it will create a key for an
	 * org — which is what keeps a member of one tenant from issuing a key
	 * against another.
	 */
	apiKey: ["create", "read", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

export const adminRole = ac.newRole({
	brand: ["read", "create", "update", "delete"],
	report: ["generate"],
	...adminAc.statements,
});

export const userRole = ac.newRole({
	brand: ["read"],
});

// ---------------------------------------------------------------------------
// Organization roles
//
// Distinct from the instance-admin roles above: these say what a member may do
// *inside* a workspace. Issuing an API key is an owner/admin action — a key can
// act as the whole organization, so handing one out is closer to inviting a
// teammate than to editing a prompt.
// ---------------------------------------------------------------------------

/** Owners and workspace admins are the same set of permissions today. */
export const ownerRole = ac.newRole({
	brand: ["read", "create", "update", "delete"],
	report: ["generate"],
	apiKey: ["create", "read", "update", "delete"],
});

export const memberRole = ac.newRole({
	brand: ["read", "create", "update", "delete"],
	report: ["generate"],
	apiKey: ["read"],
});
