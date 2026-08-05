import { lockOrganizationCapacity } from "@workspace/lib/cloud/advisory-locks";
import { db } from "@workspace/lib/db/db";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Serializes the final entitlement check and started transition with reconciliation. */
export async function withProviderStartEntitlementFence(input: {
	tx: DbTransaction;
	organizationId: string;
	resolveCurrentEligibility: () => Promise<boolean>;
	authorize: () => Promise<boolean>;
	lock?: (tx: DbTransaction, organizationId: string) => Promise<void>;
}): Promise<boolean> {
	await (input.lock ?? lockOrganizationCapacity)(input.tx, input.organizationId);
	if (!(await input.resolveCurrentEligibility())) return false;
	return input.authorize();
}
