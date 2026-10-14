import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";
import {
	memberAc,
	defaultStatements as organizationStatements,
	ownerAc,
} from "better-auth/plugins/organization/access";

export const statement = {
	...defaultStatements,
	/** A `roles` option replaces the organization plugin's built-in roles rather
	 * than extending them, so leaving these out makes its own endpoints deny
	 * every role. */
	...organizationStatements,
	brand: ["read", "create", "update", "delete"],
	report: ["generate"],
	/** Read by the api-key plugin before it mints a key for an organization. */
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

// Each starts from better-auth's role of the same name because these replace
// those wholesale.

export const ownerRole = ac.newRole({
	...ownerAc.statements,
	brand: ["read", "create", "update", "delete"],
	report: ["generate"],
	apiKey: ["create", "read", "update", "delete"],
});

/** The plugin's own create and update endpoints are blocked over HTTP, so these
 * grants only let the app's server functions act for a member; those narrow a
 * member to keys for one brand, and to revoking their own. */
export const memberRole = ac.newRole({
	...memberAc.statements,
	brand: ["read", "create", "update", "delete"],
	report: ["generate"],
	apiKey: ["read", "create", "update"],
});
