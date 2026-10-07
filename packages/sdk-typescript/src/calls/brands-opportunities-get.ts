import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import {
  getBrandOpportunitiesDescriptor,
  getBrandOpportunitiesFields,
} from '../resources/opportunities';
import type { CallerOptions } from '../resources/shared';
import type {
  GetBrandOpportunitiesErrors,
  GetBrandOpportunitiesResponses,
} from '../types/opportunities';
import type { BrandIdPath } from '../types/shared';

/**
 * Get the latest opportunities report
 *
 * **Experimental — the response shape may still change.**
 *
 * The brand's Opportunities report: a prioritized set of ways to get cited more often, with the tracked prompts and cited pages behind each one. The same analysis the dashboard shows, from the same code.
 *
 * Generation is inline and synchronous. A stored report is served while it is fresh and regenerated when it is not, so there is nothing to poll for and no way to be handed a stale one — but a request that triggers a generation waits for it. The freshness window bounds the cost: however many callers ask, one generation per brand per window. There is deliberately no `POST`, which would spend provider budget with nothing metering it per call.
 *
 * @experimental
 */
export function brandsOpportunitiesGet(
  client: Client,
  brandId: BrandIdPath,
  options?: CallerOptions,
): RestCallPromise<GetBrandOpportunitiesResponses, GetBrandOpportunitiesErrors> {
  return callPromise(
    options?.client ?? client,
    getBrandOpportunitiesDescriptor,
    mergeParams(groupParams({ brandId }, getBrandOpportunitiesFields, 'query'), options),
  );
}
