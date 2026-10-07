import type { CallerOptions } from './shared';
import { apiKeyRequirements, ElmoResource } from './shared';
import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import { callable } from '../internal/core/callable';
import { groupParams, mergeParams } from '../internal/core/params';
import { decoded, reviving } from '../internal/features/validate';
import type {
  BrandOpportunities,
  CitedPage,
  GetBrandOpportunitiesErrors,
  GetBrandOpportunitiesResponse,
  GetBrandOpportunitiesResponses,
  Opportunity,
  OpportunityPrompt,
} from '../types/opportunities';
import type { BrandIdPath } from '../types/shared';

export const getBrandOpportunitiesFields = { path: ['brandId'] };

function reviveBrandOpportunities(value: BrandOpportunities): void {
  if (value.generatedAt != null) {
    value.generatedAt = decoded(
      'BrandOpportunities.generatedAt',
      value.generatedAt,
      (raw) => new Date(raw),
    );
  }
}

export const getBrandOpportunitiesDescriptor = /* @__PURE__ */ callable({
  address: '/brands/{brandId}/opportunities',
  auth: apiKeyRequirements,
  method: 'get',
  validators: { response: /* @__PURE__ */ reviving(reviveBrandOpportunities) },
} as const);

/** Where a brand could win more citations, and why */
export class Opportunities extends ElmoResource {
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
   * @param brandId Brand identifier.
   */
  public get(
    brandId: BrandIdPath,
    options?: CallerOptions,
  ): RestCallPromise<GetBrandOpportunitiesResponses, GetBrandOpportunitiesErrors> {
    return callPromise(
      options?.client ?? this.client,
      getBrandOpportunitiesDescriptor,
      mergeParams(groupParams({ brandId }, getBrandOpportunitiesFields, 'query'), options),
    );
  }
}

export declare namespace Opportunities {
  export type {
    BrandOpportunities,
    CitedPage,
    GetBrandOpportunitiesErrors,
    GetBrandOpportunitiesResponse,
    GetBrandOpportunitiesResponses,
    Opportunity,
    OpportunityPrompt,
  };
}
