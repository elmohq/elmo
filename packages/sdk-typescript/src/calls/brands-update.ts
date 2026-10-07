import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import { updateBrandDescriptor, updateBrandFields } from '../resources/brands';
import type { CallerOptions } from '../resources/shared';
import type { UpdateBrandErrors, UpdateBrandParams, UpdateBrandResponses } from '../types/brands';

/** Update a brand */
export function brandsUpdate(
  client: Client,
  brandId: string,
  params: UpdateBrandParams,
  options?: CallerOptions,
): RestCallPromise<UpdateBrandResponses, UpdateBrandErrors> {
  return callPromise(
    options?.client ?? client,
    updateBrandDescriptor,
    mergeParams(groupParams({ ...params, brandId }, updateBrandFields, 'body'), options),
  );
}
