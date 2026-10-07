import { Analytics, Citations, PromptPerformance, QueryFanout } from './analytics';
import { Opportunities } from './opportunities';
import type { CallerOptions } from './shared';
import { apiKeyRequirements, ElmoResource } from './shared';
import { Tags } from './tags';
import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import { callable } from '../internal/core/callable';
import { groupParams, mergeParams } from '../internal/core/params';
import { decoded, reviving } from '../internal/features/validate';
import { PagePromise, pages } from '../internal/page/page';
import type {
  BrandAnalytics,
  BrandQueryFanout,
  DateRange,
  FanoutQuery,
  GetBrandAnalyticsErrors,
  GetBrandAnalyticsParams,
  GetBrandAnalyticsResponse,
  GetBrandAnalyticsResponses,
  GetBrandQueryFanoutErrors,
  GetBrandQueryFanoutParams,
  GetBrandQueryFanoutResponse,
  GetBrandQueryFanoutResponses,
  ListBrandPromptPerformanceErrors,
  ListBrandPromptPerformanceParams,
  ListBrandPromptPerformanceResponse,
  ListBrandPromptPerformanceResponses,
  ModelVisibility,
  PromptPerformanceList,
  ShareOfVoiceEntry,
  ShareOfVoicePoint,
  TagsFilter,
  VisibilityPoint,
} from '../types/analytics';
import type {
  Brand,
  BrandsList,
  CreateBrandErrors,
  CreateBrandParams,
  CreateBrandRequest,
  CreateBrandResponse,
  CreateBrandResponses,
  GetBrandErrors,
  GetBrandResponse,
  GetBrandResponses,
  ListBrandsErrors,
  ListBrandsParams,
  ListBrandsResponse,
  ListBrandsResponses,
  UpdateBrandErrors,
  UpdateBrandParams,
  UpdateBrandRequest,
  UpdateBrandResponse,
  UpdateBrandResponses,
} from '../types/brands';
import type {
  BrandOpportunities,
  CitedPage,
  GetBrandOpportunitiesErrors,
  GetBrandOpportunitiesResponse,
  GetBrandOpportunitiesResponses,
  Opportunity,
  OpportunityPrompt,
} from '../types/opportunities';
import type { BrandIdPath } from '../types/shared';
import type {
  ListBrandTagsErrors,
  ListBrandTagsResponse,
  ListBrandTagsResponses,
  Tag,
  TagList,
} from '../types/tags';

function reviveBrand(value: Brand): void {
  if (value.createdAt != null) {
    value.createdAt = decoded('Brand.createdAt', value.createdAt, (raw) => new Date(raw));
  }
  if (value.updatedAt != null) {
    value.updatedAt = decoded('Brand.updatedAt', value.updatedAt, (raw) => new Date(raw));
  }
}

function reviveBrandsList(value: BrandsList): void {
  if (value.data != null) {
    value.data.forEach((item) => {
      reviveBrand(item);
    });
  }
  if (value.brands != null) {
    value.brands.forEach((item) => {
      reviveBrand(item);
    });
  }
}

export const listBrandsDescriptor = /* @__PURE__ */ callable({
  address: '/brands',
  auth: apiKeyRequirements,
  method: 'get',
  pagination: {
    items: 'data',
    limitParam: 'limit',
    pages: 'pagination.totalPages',
    param: 'page',
    size: 'pagination.limit',
    style: 'page',
    total: 'pagination.total',
  },
  validators: { response: /* @__PURE__ */ reviving(reviveBrandsList) },
} as const);

export const createBrandDescriptor = /* @__PURE__ */ callable({
  address: '/brands',
  auth: apiKeyRequirements,
  mediaType: 'application/json',
  method: 'post',
  validators: { response: /* @__PURE__ */ reviving(reviveBrand) },
} as const);

export const getBrandFields = { path: ['brandId'] };

export const getBrandDescriptor = /* @__PURE__ */ callable({
  address: '/brands/{brandId}',
  auth: apiKeyRequirements,
  method: 'get',
  validators: { response: /* @__PURE__ */ reviving(reviveBrand) },
} as const);

export const updateBrandFields = { path: ['brandId'] };

export const updateBrandDescriptor = /* @__PURE__ */ callable({
  address: '/brands/{brandId}',
  auth: apiKeyRequirements,
  mediaType: 'application/json',
  method: 'patch',
  validators: { response: /* @__PURE__ */ reviving(reviveBrand) },
} as const);

/** Manage brand records */
export class Brands extends ElmoResource {
  /** Create a brand */
  public create(
    params: CreateBrandParams,
    options?: CallerOptions,
  ): RestCallPromise<CreateBrandResponses, CreateBrandErrors> {
    return callPromise(
      options?.client ?? this.client,
      createBrandDescriptor,
      mergeParams(groupParams(params, 'body'), options),
    );
  }

  /**
   * Get a brand
   *
   * @param brandId Brand identifier
   */
  public get(
    brandId: string,
    options?: CallerOptions,
  ): RestCallPromise<GetBrandResponses, GetBrandErrors> {
    return callPromise(
      options?.client ?? this.client,
      getBrandDescriptor,
      mergeParams(groupParams({ brandId }, getBrandFields, 'query'), options),
    );
  }

  /** List brands */
  public list(
    params?: ListBrandsParams,
    options?: CallerOptions,
  ): PagePromise<Brand, BrandsList, ListBrandsErrors> {
    return pages(
      options?.client ?? this.client,
      listBrandsDescriptor,
      mergeParams(groupParams(params, 'query'), options),
    );
  }

  /**
   * Update a brand
   *
   * @param brandId Brand identifier
   */
  public update(
    brandId: string,
    params: UpdateBrandParams,
    options?: CallerOptions,
  ): RestCallPromise<UpdateBrandResponses, UpdateBrandErrors> {
    return callPromise(
      options?.client ?? this.client,
      updateBrandDescriptor,
      mergeParams(groupParams({ ...params, brandId }, updateBrandFields, 'body'), options),
    );
  }

  private _analytics?: Analytics;
  /** Aggregated visibility, share of voice, citations, and query fan-out for a brand */
  get analytics(): Analytics {
    return (this._analytics ??= new Analytics(this.client));
  }

  private _citations?: Citations;
  get citations(): Citations {
    return (this._citations ??= new Citations(this.client));
  }

  private _opportunities?: Opportunities;
  /** Where a brand could win more citations, and why */
  get opportunities(): Opportunities {
    return (this._opportunities ??= new Opportunities(this.client));
  }

  private _promptPerformance?: PromptPerformance;
  /** Aggregated visibility, share of voice, citations, and query fan-out for a brand */
  get promptPerformance(): PromptPerformance {
    return (this._promptPerformance ??= new PromptPerformance(this.client));
  }

  private _queryFanout?: QueryFanout;
  /** Aggregated visibility, share of voice, citations, and query fan-out for a brand */
  get queryFanout(): QueryFanout {
    return (this._queryFanout ??= new QueryFanout(this.client));
  }

  private _tags?: Tags;
  /** The tags in use on a brand's prompts */
  get tags(): Tags {
    return (this._tags ??= new Tags(this.client));
  }
}

export declare namespace Brands {
  export type {
    Analytics,
    Brand,
    BrandAnalytics,
    BrandIdPath,
    BrandOpportunities,
    BrandQueryFanout,
    BrandsList,
    Citations,
    CitedPage,
    CreateBrandErrors,
    CreateBrandParams,
    CreateBrandRequest,
    CreateBrandResponse,
    CreateBrandResponses,
    DateRange,
    FanoutQuery,
    GetBrandAnalyticsErrors,
    GetBrandAnalyticsParams,
    GetBrandAnalyticsResponse,
    GetBrandAnalyticsResponses,
    GetBrandErrors,
    GetBrandOpportunitiesErrors,
    GetBrandOpportunitiesResponse,
    GetBrandOpportunitiesResponses,
    GetBrandQueryFanoutErrors,
    GetBrandQueryFanoutParams,
    GetBrandQueryFanoutResponse,
    GetBrandQueryFanoutResponses,
    GetBrandResponse,
    GetBrandResponses,
    ListBrandPromptPerformanceErrors,
    ListBrandPromptPerformanceParams,
    ListBrandPromptPerformanceResponse,
    ListBrandPromptPerformanceResponses,
    ListBrandsErrors,
    ListBrandsParams,
    ListBrandsResponse,
    ListBrandsResponses,
    ListBrandTagsErrors,
    ListBrandTagsResponse,
    ListBrandTagsResponses,
    ModelVisibility,
    Opportunities,
    Opportunity,
    OpportunityPrompt,
    PromptPerformance,
    PromptPerformanceList,
    QueryFanout,
    ShareOfVoiceEntry,
    ShareOfVoicePoint,
    Tag,
    TagList,
    Tags,
    TagsFilter,
    UpdateBrandErrors,
    UpdateBrandParams,
    UpdateBrandRequest,
    UpdateBrandResponse,
    UpdateBrandResponses,
    VisibilityPoint,
  };
}
