import type { CallerOptions } from './shared';
import { apiKeyRequirements, ElmoResource } from './shared';
import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import { callable } from '../internal/core/callable';
import { groupParams, mergeParams } from '../internal/core/params';
import type { BrandIdPath } from '../types/shared';
import type {
  ListBrandTagsErrors,
  ListBrandTagsResponse,
  ListBrandTagsResponses,
  Tag,
  TagList,
} from '../types/tags';

export const listBrandTagsFields = { path: ['brandId'] };

export const listBrandTagsDescriptor = /* @__PURE__ */ callable({
  address: '/brands/{brandId}/tags',
  auth: apiKeyRequirements,
  method: 'get',
} as const);

/** The tags in use on a brand's prompts */
export class Tags extends ElmoResource {
  /**
   * List a brand's tags
   *
   * Every tag in use on the brand's prompts, with how many carry each — enough to build the same filter the dashboard shows without paging the whole prompt list to derive it.
   *
   * Tags are not a resource of their own: a tag exists exactly as long as some prompt carries it. `branded` and `unbranded` are computed by Elmo and always listed.
   *
   * @param brandId Brand identifier.
   */
  public list(
    brandId: BrandIdPath,
    options?: CallerOptions,
  ): RestCallPromise<ListBrandTagsResponses, ListBrandTagsErrors> {
    return callPromise(
      options?.client ?? this.client,
      listBrandTagsDescriptor,
      mergeParams(groupParams({ brandId }, listBrandTagsFields, 'query'), options),
    );
  }
}

export declare namespace Tags {
  export type { ListBrandTagsErrors, ListBrandTagsResponse, ListBrandTagsResponses, Tag, TagList };
}
