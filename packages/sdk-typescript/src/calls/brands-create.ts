import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import { createBrandDescriptor } from '../resources/brands';
import type { CallerOptions } from '../resources/shared';
import type { CreateBrandErrors, CreateBrandParams, CreateBrandResponses } from '../types/brands';

/** Create a brand */
export function brandsCreate(
  client: Client,
  params: CreateBrandParams,
  options?: CallerOptions,
): RestCallPromise<CreateBrandResponses, CreateBrandErrors> {
  return callPromise(
    options?.client ?? client,
    createBrandDescriptor,
    mergeParams(groupParams(params, 'body'), options),
  );
}
