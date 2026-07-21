import type { DeploymentMode } from "@workspace/config/types";

export type EvaluationConfigEditScope = "instance" | "organization" | "brand" | "prompt";
export type EvaluationConfigAction = "catalog" | "target-selection" | "run-policy";
export type OrganizationConfigRole = "owner" | "admin" | "member" | undefined;

export interface EvaluationConfigAccessInput {
	mode: DeploymentMode;
	isGlobalAdmin: boolean;
	organizationRole?: OrganizationConfigRole;
	scope: EvaluationConfigEditScope;
	action?: EvaluationConfigAction;
}

/**
 * Run configuration is intentionally distinct from ordinary brand content.
 * Whitelabel members can keep editing brands, prompts, and competitors through
 * their existing endpoints, but never gain access to model or cadence controls.
 */
export function canEditEvaluationConfig(input: EvaluationConfigAccessInput): boolean {
	const { mode, isGlobalAdmin, organizationRole, scope, action = "target-selection" } = input;
	if (mode === "demo") return false;

	if (mode === "local") return true;

	if (mode === "whitelabel") {
		return isGlobalAdmin && (scope === "instance" || scope === "brand");
	}

	if (scope === "instance") return isGlobalAdmin;
	if (isGlobalAdmin) return true;
	if (organizationRole !== "owner" && organizationRole !== "admin") return false;

	// Standard cloud plans can choose from their allowed target menu, but their
	// schedule and sampling are plan-controlled. A custom plan is represented by
	// a server-side administrator changing the organization-level run policy.
	return action !== "run-policy";
}

export function canEditEvaluationEntitlements(input: Omit<EvaluationConfigAccessInput, "scope">): boolean {
	if (input.mode === "demo" || input.mode === "whitelabel") return false;
	return input.isGlobalAdmin || input.mode === "local";
}
