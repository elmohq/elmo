import { lockOrganizationCapacity } from "@workspace/lib/cloud/advisory-locks";
import { db } from "@workspace/lib/db/db";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Serializes the final eligibility check and started transition with entitlement reconciliation. */
export async function withProviderStartEntitlementFence<T>(input: {
	tx: DbTransaction;
	organizationId: string;
	authorize: () => Promise<T>;
	lock?: (tx: DbTransaction, organizationId: string) => Promise<void>;
}): Promise<T> {
	await (input.lock ?? lockOrganizationCapacity)(input.tx, input.organizationId);
	return input.authorize();
}
