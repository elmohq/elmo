import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import { getBrandQueryFanoutDescriptor, getBrandQueryFanoutFields } from '../resources/analytics';
import type { CallerOptions } from '../resources/shared';
import type {
  GetBrandQueryFanoutErrors,
  GetBrandQueryFanoutParams,
  GetBrandQueryFanoutResponses,
} from '../types/analytics';
import type { BrandIdPath } from '../types/shared';

/**
 * Get query fan-out
 *
 * The searches engines ran while answering this brand's prompts. Engines that don't expose their searches still contribute runs, so `coverageRate` is the honest denominator.
 */
export function brandsQueryFanoutGet(
  client: Client,
  brandId: BrandIdPath,
  params: GetBrandQueryFanoutParams,
  options?: CallerOptions,
): RestCallPromise<GetBrandQueryFanoutResponses, GetBrandQueryFanoutErrors> {
  return callPromise(
    options?.client ?? client,
    getBrandQueryFanoutDescriptor,
    mergeParams(groupParams({ ...params, brandId }, getBrandQueryFanoutFields, 'query'), options),
  );
}
