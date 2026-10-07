import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import { getBrandDescriptor, getBrandFields } from '../resources/brands';
import type { CallerOptions } from '../resources/shared';
import type { GetBrandErrors, GetBrandResponses } from '../types/brands';

/** Get a brand */
export function brandsGet(
  client: Client,
  brandId: string,
  options?: CallerOptions,
): RestCallPromise<GetBrandResponses, GetBrandErrors> {
  return callPromise(
    options?.client ?? client,
    getBrandDescriptor,
    mergeParams(groupParams({ brandId }, getBrandFields, 'query'), options),
  );
}
