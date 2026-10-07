import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import type { Client } from '../internal/core/client';
import { groupParams, mergeParams } from '../internal/core/params';
import type { CallerOptions } from '../resources/shared';
import { listBrandTagsDescriptor, listBrandTagsFields } from '../resources/tags';
import type { BrandIdPath } from '../types/shared';
import type { ListBrandTagsErrors, ListBrandTagsResponses } from '../types/tags';

/**
 * List a brand's tags
 *
 * Every tag in use on the brand's prompts, with how many carry each — enough to build the same filter the dashboard shows without paging the whole prompt list to derive it.
 *
 * Tags are not a resource of their own: a tag exists exactly as long as some prompt carries it. `branded` and `unbranded` are computed by Elmo and always listed.
 */
export function brandsTagsList(
  client: Client,
  brandId: BrandIdPath,
  options?: CallerOptions,
): RestCallPromise<ListBrandTagsResponses, ListBrandTagsErrors> {
  return callPromise(
    options?.client ?? client,
    listBrandTagsDescriptor,
    mergeParams(groupParams({ brandId }, listBrandTagsFields, 'query'), options),
  );
}
