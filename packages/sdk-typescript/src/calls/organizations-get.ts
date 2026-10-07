import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import { getOrganizationDescriptor, getOrganizationFields } from '../resources/organizations';
import type { CallerOptions } from '../resources/shared';
import type { GetOrganizationErrors, GetOrganizationResponses } from '../types/organizations';

/**
 * Get an organization
 *
 * No scope required. An organization outside the key's reach answers `404`, identically to one that does not exist.
 */
export function organizationsGet(
  client: Client,
  organizationId: string,
  options?: CallerOptions,
): RestCallPromise<GetOrganizationResponses, GetOrganizationErrors> {
  return callPromise(
    options?.client ?? client,
    getOrganizationDescriptor,
    mergeParams(groupParams({ organizationId }, getOrganizationFields, 'query'), options),
  );
}
