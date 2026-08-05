import type { DeploymentMode } from "@workspace/config/types";

export const CLOUD_BILLING_POLL_INTERVAL_MS = 1_500;
export const CLOUD_BILLING_MAX_POLL_ATTEMPTS = 30;

export type NewBrandWorkspaceDecision =
	| { kind: "legacy"; organizationId: string | null }
	| { kind: "choose-workspace" }
	| { kind: "create"; organizationId: string }
	| { kind: "billing"; organizationId: string };

export function resolveNewBrandWorkspace(input: {
	mode: DeploymentMode;
	organizationIds: string[];
	requestedOrganizationId?: string;
	activeCloudOrganizationIds?: ReadonlySet<string>;
}): NewBrandWorkspaceDecision {
	if (input.mode !== "cloud") {
		return {
			kind: "legacy",
			organizationId:
				input.requestedOrganizationId ?? (input.organizationIds.length === 1 ? input.organizationIds[0] : null),
		};
	}

	const requested = input.requestedOrganizationId;
	if (requested && !input.organizationIds.includes(requested)) {
		throw new Error("Forbidden: No access to this organization");
	}
	const organizationId = requested ?? (input.organizationIds.length === 1 ? input.organizationIds[0] : undefined);
	if (!organizationId) return { kind: "choose-workspace" };
	return input.activeCloudOrganizationIds?.has(organizationId)
		? { kind: "create", organizationId }
		: { kind: "billing", organizationId };
}

export function isProjectedCloudSubscriptionActive(subscription: { status: string } | null): boolean {
	return subscription?.status === "active";
}

export function cloudBillingPath(
	organizationId: string,
	search?: { checkout?: "success" | "cancel"; returnTo?: string },
): string {
	const path = `/app/workspaces/${encodeURIComponent(organizationId)}/billing`;
	const params = new URLSearchParams();
	if (search?.checkout) params.set("checkout", search.checkout);
	if (search?.returnTo) params.set("returnTo", search.returnTo);
	return params.size > 0 ? `${path}?${params}` : path;
}

export function maximumSelectedTargets(selectedTargetsByBrand: Array<{ targetKeys: string[] }>): number {
	return selectedTargetsByBrand.reduce((maximum, selection) => Math.max(maximum, selection.targetKeys.length), 0);
}
