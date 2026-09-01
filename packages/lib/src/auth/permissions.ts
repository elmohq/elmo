/**
 * Access control definitions for the application.
 *
 * Uses better-auth's built-in access control system to define resources,
 * actions, and role-based permission grants. Shared across all deployment modes.
 */
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";
import {
	memberAc,
	defaultStatements as organizationStatements,
	ownerAc,
} from "better-auth/plugins/organization/access";

export const statement = {
	...defaultStatements,
	/**
	 * Inviting, removing, renaming: the organization plugin gates its own
	 * endpoints on these, and a role given to that plugin *replaces* its built-in
	 * roles rather than extending them. Leave them out and every one of those
	 * endpoints denies every role, because the role was built from a statement
	 * that has never heard of them.
	 */
	...organizationStatements,
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
// *inside* a workspace. Each starts from what better-auth's own role of the same
// name grants, because these replace those wholesale; what follows is what this
// application adds on top.
//
// Issuing an API key is an owner/admin action — a key can act as the whole
// organization, so handing one out is closer to inviting a teammate than to
// editing a prompt.
// ---------------------------------------------------------------------------

/** Owners and workspace admins are the same set of permissions today. */
export const ownerRole = ac.newRole({
	...ownerAc.statements,
	brand: ["read", "create", "update", "delete"],
	report: ["generate"],
	apiKey: ["create", "read", "update", "delete"],
});

export const memberRole = ac.newRole({
	...memberAc.statements,
	brand: ["read", "create", "update", "delete"],
	report: ["generate"],
	apiKey: ["read"],
});
