import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import {
  listBrandCitationDomainsDescriptor,
  listBrandCitationDomainsFields,
} from '../resources/analytics';
import type { CallerOptions } from '../resources/shared';
import type {
  ListBrandCitationDomainsErrors,
  ListBrandCitationDomainsParams,
  ListBrandCitationDomainsResponses,
} from '../types/analytics';
import type { BrandIdPath } from '../types/shared';

/**
 * List cited domains
 *
 * Domains the engines cited when answering this brand's prompts, categorized and compared against the equal-length window immediately before this one.
 */
export function brandsCitationsDomainsList(
  client: Client,
  brandId: BrandIdPath,
  params: ListBrandCitationDomainsParams,
  options?: CallerOptions,
): RestCallPromise<ListBrandCitationDomainsResponses, ListBrandCitationDomainsErrors> {
  return callPromise(
    options?.client ?? client,
    listBrandCitationDomainsDescriptor,
    mergeParams(
      groupParams({ ...params, brandId }, listBrandCitationDomainsFields, 'query'),
      options,
    ),
  );
}
