/**
 * What each organization role may do.
 *
 * The organization plugin gates its own endpoints — inviting, cancelling,
 * removing a member, renaming the workspace — on statements it defines itself,
 * and a `roles` option handed to it *replaces* its built-in roles rather than
 * extending them. A role assembled from a statement that omits those is a role
 * that silently denies all four, which reads to a person as an invite button
 * that never works. These are the permissions the plugin will actually ask for.
 */
import { describe, expect, it } from "vitest";
import { memberRole, ownerRole } from "./permissions";

/** Every permission a plugin endpoint checks, and who is meant to hold it. */
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
		// A member reads keys but cannot mint one: a key acts as the whole
		// organization, so issuing one is an owner's decision.
		expect(memberRole.authorize({ apiKey: ["read"] }).success).toBe(true);
		expect(memberRole.authorize({ apiKey: ["create"] }).success).toBe(false);
	});
});
