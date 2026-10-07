import type { CallerOptions } from './shared';
import { apiKeyRequirements, ElmoResource } from './shared';
import { callPromise, RestCallPromise } from '../internal/core/call-promise';
import { callable } from '../internal/core/callable';
import { groupParams, mergeParams } from '../internal/core/params';
import { decoded, reviving } from '../internal/features/validate';
import type {
  BrandAnalytics,
  BrandQueryFanout,
  CitationDomain,
  CitationDomainList,
  CitationUrl,
  CitationUrlList,
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
  ListBrandCitationDomainsErrors,
  ListBrandCitationDomainsParams,
  ListBrandCitationDomainsResponse,
  ListBrandCitationDomainsResponses,
  ListBrandCitationUrlsErrors,
  ListBrandCitationUrlsParams,
  ListBrandCitationUrlsResponse,
  ListBrandCitationUrlsResponses,
  ListBrandPromptPerformanceErrors,
  ListBrandPromptPerformanceParams,
  ListBrandPromptPerformanceResponse,
  ListBrandPromptPerformanceResponses,
  ModelVisibility,
  PromptPerformance as PromptPerformance2,
  PromptPerformanceList,
  ShareOfVoiceEntry,
  ShareOfVoicePoint,
  VisibilityPoint,
} from '../types/analytics';
import type { BrandIdPath } from '../types/shared';

export const getBrandAnalyticsFields = { path: ['brandId'] };

function reviveDateRange(value: DateRange): void {
  if (value.start != null) {
    value.start = decoded('DateRange.start', value.start, (raw) => new Date(raw));
  }
  if (value.end != null) {
    value.end = decoded('DateRange.end', value.end, (raw) => new Date(raw));
  }
}

function reviveBrandAnalytics(value: BrandAnalytics): void {
  if (value.range != null) {
    reviveDateRange(value.range);
  }
}

export const getBrandAnalyticsDescriptor = /* @__PURE__ */ callable({
  address: '/brands/{brandId}/analytics',
  auth: apiKeyRequirements,
  method: 'get',
  validators: { response: /* @__PURE__ */ reviving(reviveBrandAnalytics) },
} as const);

export const listBrandCitationDomainsFields = { path: ['brandId'] };

function reviveCitationDomainList(value: CitationDomainList): void {
  if (value.range != null) {
    reviveDateRange(value.range);
  }
}

export const listBrandCitationDomainsDescriptor = /* @__PURE__ */ callable({
  address: '/brands/{brandId}/citations/domains',
  auth: apiKeyRequirements,
  method: 'get',
  validators: { response: /* @__PURE__ */ reviving(reviveCitationDomainList) },
} as const);

export const listBrandCitationUrlsFields = { path: ['brandId'] };

function reviveCitationUrlList(value: CitationUrlList): void {
  if (value.range != null) {
    reviveDateRange(value.range);
  }
}

export const listBrandCitationUrlsDescriptor = /* @__PURE__ */ callable({
  address: '/brands/{brandId}/citations/urls',
  auth: apiKeyRequirements,
  method: 'get',
  validators: { response: /* @__PURE__ */ reviving(reviveCitationUrlList) },
} as const);

export const listBrandPromptPerformanceFields = { path: ['brandId'] };

function revivePromptPerformance(value: PromptPerformance2): void {
  if (value.lastRunAt != null) {
    value.lastRunAt = decoded(
      'PromptPerformance.lastRunAt',
      value.lastRunAt,
      (raw) => new Date(raw),
    );
  }
  if (value.firstEvaluatedAt != null) {
    value.firstEvaluatedAt = decoded(
      'PromptPerformance.firstEvaluatedAt',
      value.firstEvaluatedAt,
      (raw) => new Date(raw),
    );
  }
}

function revivePromptPerformanceList(value: PromptPerformanceList): void {
  if (value.range != null) {
    reviveDateRange(value.range);
  }
  if (value.data != null) {
    value.data.forEach((item) => {
      revivePromptPerformance(item);
    });
  }
}

export const listBrandPromptPerformanceDescriptor = /* @__PURE__ */ callable({
  address: '/brands/{brandId}/prompt-performance',
  auth: apiKeyRequirements,
  method: 'get',
  validators: { response: /* @__PURE__ */ reviving(revivePromptPerformanceList) },
} as const);

export const getBrandQueryFanoutFields = { path: ['brandId'] };

function reviveBrandQueryFanout(value: BrandQueryFanout): void {
  if (value.range != null) {
    reviveDateRange(value.range);
  }
}

export const getBrandQueryFanoutDescriptor = /* @__PURE__ */ callable({
  address: '/brands/{brandId}/query-fanout',
  auth: apiKeyRequirements,
  method: 'get',
  validators: { response: /* @__PURE__ */ reviving(reviveBrandQueryFanout) },
} as const);

/** Aggregated visibility, share of voice, citations, and query fan-out for a brand */
export class Analytics extends ElmoResource {
  /**
   * Get a brand's analytics
   *
   * Visibility, share of voice, the per-model breakdown and the citation totals for one window, in one request.
   *
   * The long lists — cited domains and URLs, sub-queries, per-prompt results — are endpoints of their own. Everything else is always included.
   *
   * @param brandId Brand identifier.
   */
  public get(
    brandId: BrandIdPath,
    params: GetBrandAnalyticsParams,
    options?: CallerOptions,
  ): RestCallPromise<GetBrandAnalyticsResponses, GetBrandAnalyticsErrors> {
    return callPromise(
      options?.client ?? this.client,
      getBrandAnalyticsDescriptor,
      mergeParams(groupParams({ ...params, brandId }, getBrandAnalyticsFields, 'query'), options),
    );
  }
}

/** Aggregated visibility, share of voice, citations, and query fan-out for a brand */
export class Domains extends ElmoResource {
  /**
   * List cited domains
   *
   * Domains the engines cited when answering this brand's prompts, categorized and compared against the equal-length window immediately before this one.
   *
   * @param brandId Brand identifier.
   */
  public list(
    brandId: BrandIdPath,
    params: ListBrandCitationDomainsParams,
    options?: CallerOptions,
  ): RestCallPromise<ListBrandCitationDomainsResponses, ListBrandCitationDomainsErrors> {
    return callPromise(
      options?.client ?? this.client,
      listBrandCitationDomainsDescriptor,
      mergeParams(
        groupParams({ ...params, brandId }, listBrandCitationDomainsFields, 'query'),
        options,
      ),
    );
  }
}

/** Aggregated visibility, share of voice, citations, and query fan-out for a brand */
export class Urls extends ElmoResource {
  /**
   * List cited URLs
   *
   * Individual pages the engines cited, with their category and page type.
   *
   * @param brandId Brand identifier.
   */
  public list(
    brandId: BrandIdPath,
    params: ListBrandCitationUrlsParams,
    options?: CallerOptions,
  ): RestCallPromise<ListBrandCitationUrlsResponses, ListBrandCitationUrlsErrors> {
    return callPromise(
      options?.client ?? this.client,
      listBrandCitationUrlsDescriptor,
      mergeParams(
        groupParams({ ...params, brandId }, listBrandCitationUrlsFields, 'query'),
        options,
      ),
    );
  }
}

export class Citations extends ElmoResource {
  private _domains?: Domains;
  /** Aggregated visibility, share of voice, citations, and query fan-out for a brand */
  get domains(): Domains {
    return (this._domains ??= new Domains(this.client));
  }

  private _urls?: Urls;
  /** Aggregated visibility, share of voice, citations, and query fan-out for a brand */
  get urls(): Urls {
    return (this._urls ??= new Urls(this.client));
  }
}

/** Aggregated visibility, share of voice, citations, and query fan-out for a brand */
export class PromptPerformance extends ElmoResource {
  /**
   * List prompt performance
   *
   * Per-prompt mention rates over the window. The analytics counterpart to `GET /prompts?brandId=`, which returns prompt configuration rather than results.
   *
   * A prompt the brand stopped tracking is not sampled, so it has no results over the window and does not appear here.
   *
   * @param brandId Brand identifier.
   */
  public list(
    brandId: BrandIdPath,
    params: ListBrandPromptPerformanceParams,
    options?: CallerOptions,
  ): RestCallPromise<ListBrandPromptPerformanceResponses, ListBrandPromptPerformanceErrors> {
    return callPromise(
      options?.client ?? this.client,
      listBrandPromptPerformanceDescriptor,
      mergeParams(
        groupParams({ ...params, brandId }, listBrandPromptPerformanceFields, 'query'),
        options,
      ),
    );
  }
}

/** Aggregated visibility, share of voice, citations, and query fan-out for a brand */
export class QueryFanout extends ElmoResource {
  /**
   * Get query fan-out
   *
   * The searches engines ran while answering this brand's prompts. Engines that don't expose their searches still contribute runs, so `coverageRate` is the honest denominator.
   *
   * @param brandId Brand identifier.
   */
  public get(
    brandId: BrandIdPath,
    params: GetBrandQueryFanoutParams,
    options?: CallerOptions,
  ): RestCallPromise<GetBrandQueryFanoutResponses, GetBrandQueryFanoutErrors> {
    return callPromise(
      options?.client ?? this.client,
      getBrandQueryFanoutDescriptor,
      mergeParams(groupParams({ ...params, brandId }, getBrandQueryFanoutFields, 'query'), options),
    );
  }
}

export declare namespace Analytics {
  export type {
    BrandAnalytics,
    GetBrandAnalyticsErrors,
    GetBrandAnalyticsParams,
    GetBrandAnalyticsResponse,
    GetBrandAnalyticsResponses,
    ModelVisibility,
    ShareOfVoiceEntry,
    ShareOfVoicePoint,
    VisibilityPoint,
  };
}

export declare namespace Domains {
  export type {
    CitationDomain,
    CitationDomainList,
    ListBrandCitationDomainsErrors,
    ListBrandCitationDomainsParams,
    ListBrandCitationDomainsResponse,
    ListBrandCitationDomainsResponses,
  };
}

export declare namespace Urls {
  export type {
    CitationUrl,
    CitationUrlList,
    ListBrandCitationUrlsErrors,
    ListBrandCitationUrlsParams,
    ListBrandCitationUrlsResponse,
    ListBrandCitationUrlsResponses,
  };
}

export declare namespace Citations {
  export type {
    CitationDomain,
    CitationDomainList,
    CitationUrl,
    CitationUrlList,
    Domains,
    ListBrandCitationDomainsErrors,
    ListBrandCitationDomainsParams,
    ListBrandCitationDomainsResponse,
    ListBrandCitationDomainsResponses,
    ListBrandCitationUrlsErrors,
    ListBrandCitationUrlsParams,
    ListBrandCitationUrlsResponse,
    ListBrandCitationUrlsResponses,
    Urls,
  };
}

export declare namespace PromptPerformance {
  export type {
    ListBrandPromptPerformanceErrors,
    ListBrandPromptPerformanceParams,
    ListBrandPromptPerformanceResponse,
    ListBrandPromptPerformanceResponses,
    PromptPerformance2 as PromptPerformance,
    PromptPerformanceList,
  };
}

export declare namespace QueryFanout {
  export type {
    BrandQueryFanout,
    FanoutQuery,
    GetBrandQueryFanoutErrors,
    GetBrandQueryFanoutParams,
    GetBrandQueryFanoutResponse,
    GetBrandQueryFanoutResponses,
  };
}
