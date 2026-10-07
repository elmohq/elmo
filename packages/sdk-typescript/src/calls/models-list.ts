import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { listModelsDescriptor } from '../resources/models';
import type { CallerOptions } from '../resources/shared';
import type { ListModelsErrors, ListModelsResponses } from '../types/models';

/**
 * List trackable models
 *
 * The answer engines this deployment can track, so a client can build a model filter without hardcoding ids that differ between deployments.
 *
 * Requires no scope.
 */
export function modelsList(
  client: Client,
  options?: CallerOptions,
): RestCallPromise<ListModelsResponses, ListModelsErrors> {
  return callPromise(options?.client ?? client, listModelsDescriptor, options);
}
