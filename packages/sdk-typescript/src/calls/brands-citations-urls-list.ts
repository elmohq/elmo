import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import {
  listBrandCitationUrlsDescriptor,
  listBrandCitationUrlsFields,
} from '../resources/analytics';
import type { CallerOptions } from '../resources/shared';
import type {
  ListBrandCitationUrlsErrors,
  ListBrandCitationUrlsParams,
  ListBrandCitationUrlsResponses,
} from '../types/analytics';
import type { BrandIdPath } from '../types/shared';

/**
 * List cited URLs
 *
 * Individual pages the engines cited, with their category and page type.
 */
export function brandsCitationsUrlsList(
  client: Client,
  brandId: BrandIdPath,
  params: ListBrandCitationUrlsParams,
  options?: CallerOptions,
): RestCallPromise<ListBrandCitationUrlsResponses, ListBrandCitationUrlsErrors> {
  return callPromise(
    options?.client ?? client,
    listBrandCitationUrlsDescriptor,
    mergeParams(groupParams({ ...params, brandId }, listBrandCitationUrlsFields, 'query'), options),
  );
}
