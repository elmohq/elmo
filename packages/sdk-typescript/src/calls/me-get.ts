import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { getMeDescriptor } from '../resources/identity';
import type { CallerOptions } from '../resources/shared';
import type { GetMeErrors, GetMeResponses } from '../types/identity';

/**
 * Describe the calling key
 *
 * What this key is, which organization and brands it reaches, and which scopes it holds. Requires no scope, so it is always safe to call first when wiring up an integration.
 */
export function meGet(
  client: Client,
  options?: CallerOptions,
): RestCallPromise<GetMeResponses, GetMeErrors> {
  return callPromise(options?.client ?? client, getMeDescriptor, options);
}
