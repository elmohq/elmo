/**
 * A `roles` option *replaces* the organization plugin's built-in roles, so a
 * role assembled from a statement that omits its own silently denies inviting,
 * removing and renaming — which reads as an invite button that never works.
 */
import { describe, expect, it } from "vitest";
import { memberRole, ownerRole } from "./permissions";

const ORGANIZATION_ACTIONS = {
	"invitation:create": { invitation: ["create"] },
	"invitation:cancel": { invitation: ["cancel"] },
	"member:create": { member: ["create"] },
	"member:update": { member: ["update"] },
	"member:delete": { member: ["delete"] },
	"organization:update": { organization: ["update"] },
	"organization:delete": { organization: ["delete"] },
} as const;

describe("organization roles", () => {
	it("lets an owner run the workspace, which is what the plugin's endpoints ask", () => {
		for (const [action, permission] of Object.entries(ORGANIZATION_ACTIONS)) {
			expect(ownerRole.authorize(permission).success, action).toBe(true);
		}
	});

	it("leaves a member out of every one of them", () => {
		for (const [action, permission] of Object.entries(ORGANIZATION_ACTIONS)) {
			expect(memberRole.authorize(permission).success, action).toBe(false);
		}
	});

	it("keeps the application's own grants, which is why these roles are custom at all", () => {
		expect(ownerRole.authorize({ apiKey: ["create"] }).success).toBe(true);
		expect(ownerRole.authorize({ brand: ["delete"] }).success).toBe(true);
		// A key acts as the whole organization, so issuing one is an owner's call.
		expect(memberRole.authorize({ apiKey: ["read"] }).success).toBe(true);
		expect(memberRole.authorize({ apiKey: ["create"] }).success).toBe(false);
	});
});
