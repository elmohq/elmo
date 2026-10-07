import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import {
  listBrandPromptPerformanceDescriptor,
  listBrandPromptPerformanceFields,
} from '../resources/analytics';
import type { CallerOptions } from '../resources/shared';
import type {
  ListBrandPromptPerformanceErrors,
  ListBrandPromptPerformanceParams,
  ListBrandPromptPerformanceResponses,
} from '../types/analytics';
import type { BrandIdPath } from '../types/shared';

/**
 * List prompt performance
 *
 * Per-prompt mention rates over the window. The analytics counterpart to `GET /prompts?brandId=`, which returns prompt configuration rather than results.
 *
 * A prompt the brand stopped tracking is not sampled, so it has no results over the window and does not appear here.
 */
export function brandsPromptPerformanceList(
  client: Client,
  brandId: BrandIdPath,
  params: ListBrandPromptPerformanceParams,
  options?: CallerOptions,
): RestCallPromise<ListBrandPromptPerformanceResponses, ListBrandPromptPerformanceErrors> {
  return callPromise(
    options?.client ?? client,
    listBrandPromptPerformanceDescriptor,
    mergeParams(
      groupParams({ ...params, brandId }, listBrandPromptPerformanceFields, 'query'),
      options,
    ),
  );
}
